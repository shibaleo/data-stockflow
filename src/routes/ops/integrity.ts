import { createApp } from "@/lib/create-app";
import { createRoute, z } from "@hono/zod-openapi";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { requireTenant, requireAuth, requireRole } from "@/middleware/guards";
import {
  computeLinesHash,
  computeRevisionHash,
  computeHeaderHash,
  GENESIS_PREV_HASH,
  type LineHashInput,
} from "@/lib/hash-chain";
import { errorSchema } from "@/lib/validators";
import type { JournalLineRow } from "@/lib/types";

const S = "data_stockflow";

const app = createApp();

app.use("*", requireTenant(), requireAuth());

// ── Schemas ──

const headerChainResultSchema = z.object({
  status: z.enum(["valid", "broken"]),
  total_headers: z.number(),
  verified_count: z.number(),
  first_break: z
    .object({
      sequence_no: z.number(),
      idempotency_key: z.string(),
      expected_hash: z.string(),
      actual_hash: z.string(),
    })
    .nullable(),
});

const revisionChainResultSchema = z.object({
  status: z.enum(["valid", "broken"]),
  journal_key: z.number(),
  total_revisions: z.number(),
  verified_count: z.number(),
  first_break: z
    .object({
      revision: z.number(),
      field: z.string(),
      expected: z.string(),
      actual: z.string(),
    })
    .nullable(),
});

// ── GET /header-chain ──

const headerChainRoute = createRoute({
  method: "get",
  path: "/header-chain",
  tags: ["Integrity"],
  summary: "Verify the header chain for the current tenant",
  responses: {
    200: {
      description: "Verification result",
      content: {
        "application/json": {
          schema: z.object({ data: headerChainResultSchema }),
        },
      },
    },
  },
});

app.use(headerChainRoute.getRoutingPath(), requireRole("admin", "audit"));
app.openapi(headerChainRoute, async (c) => {
  const tenantKey = c.get("tenantKey");

  const { rows } = await db.execute(sql`
    SELECT idempotency_key, tenant_key, sequence_no, prev_header_hash, header_hash, created_at
    FROM ${sql.raw(`"${S}".voucher`)}
    WHERE tenant_key = ${tenantKey} AND revision = 1
    ORDER BY sequence_no ASC
  `);

  type HeaderRow = {
    idempotency_key: string;
    tenant_key: number;
    sequence_no: number;
    prev_header_hash: string;
    header_hash: string;
    created_at: Date;
  };
  const headers = rows as HeaderRow[];

  if (headers.length === 0) {
    return c.json({
      data: { status: "valid" as const, total_headers: 0, verified_count: 0, first_break: null },
    });
  }

  let verified = 0;
  let prevHash = "";

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];

    // Verify prev_header_hash linkage
    if (i > 0 && h.prev_header_hash !== prevHash) {
      return c.json({
        data: {
          status: "broken" as const,
          total_headers: headers.length,
          verified_count: verified,
          first_break: {
            sequence_no: h.sequence_no,
            idempotency_key: h.idempotency_key,
            expected_hash: prevHash,
            actual_hash: h.prev_header_hash,
          },
        },
      });
    }

    // Recompute hash
    const expected = computeHeaderHash({
      prev_header_hash: h.prev_header_hash,
      tenant_key: h.tenant_key,
      sequence_no: h.sequence_no,
      idempotency_key: h.idempotency_key,
      created_at:
        h.created_at instanceof Date
          ? h.created_at.toISOString()
          : String(h.created_at),
    });

    if (expected !== h.header_hash) {
      return c.json({
        data: {
          status: "broken" as const,
          total_headers: headers.length,
          verified_count: verified,
          first_break: {
            sequence_no: h.sequence_no,
            idempotency_key: h.idempotency_key,
            expected_hash: expected,
            actual_hash: h.header_hash,
          },
        },
      });
    }

    prevHash = h.header_hash;
    verified++;
  }

  return c.json({
    data: {
      status: "valid" as const,
      total_headers: headers.length,
      verified_count: verified,
      first_break: null,
    },
  });
});

// ── GET /revision-chain/:journalId ──

const revisionChainRoute = createRoute({
  method: "get",
  path: "/revision-chain/{journalId}",
  tags: ["Integrity"],
  summary: "Verify the revision chain for a specific journal",
  request: {
    params: z.object({ journalId: z.string() }),
  },
  responses: {
    200: {
      description: "Verification result",
      content: {
        "application/json": {
          schema: z.object({ data: revisionChainResultSchema }),
        },
      },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

app.use(revisionChainRoute.getRoutingPath(), requireRole("admin", "audit"));
app.openapi(revisionChainRoute, async (c) => {
  const journalKey = Number(c.req.param("journalId"));

  const { rows: revRows } = await db.execute(sql`
    SELECT key, revision, journal_type,
      slip_category, adjustment_flag, description,
      lines_hash, prev_revision_hash, revision_hash
    FROM ${sql.raw(`"${S}".journal`)}
    WHERE key = ${journalKey}
    ORDER BY revision ASC
  `);

  type RevRow = {
    key: number;
    revision: number;
    journal_type: string;
    slip_category: string;
    adjustment_flag: string;
    description: string | null;
    lines_hash: string;
    prev_revision_hash: string;
    revision_hash: string;
  };
  const revisions = revRows as RevRow[];

  if (revisions.length === 0) {
    return c.json({ error: "Journal not found" }, 404) as never;
  }

  let verified = 0;
  let prevRevHash = "";

  for (let i = 0; i < revisions.length; i++) {
    const r = revisions[i];

    // Verify chain linkage
    if (i > 0 && r.prev_revision_hash !== prevRevHash) {
      return c.json({
        data: {
          status: "broken" as const,
          journal_key: journalKey,
          total_revisions: revisions.length,
          verified_count: verified,
          first_break: {
            revision: r.revision,
            field: "prev_revision_hash",
            expected: prevRevHash,
            actual: r.prev_revision_hash,
          },
        },
      }, 200);
    }

    // Verify lines_hash
    const { rows: lineRows } = await db.execute(sql`
      SELECT line_group, side, account_key, department_key, counterparty_key,
        amount, description
      FROM ${sql.raw(`"${S}".journal_line`)}
      WHERE journal_key = ${journalKey} AND journal_revision = ${r.revision}
      ORDER BY line_group, side
    `);
    const linesInput: LineHashInput[] = (lineRows as JournalLineRow[]).map(
      (l) => ({
        line_group: l.line_group,
        side: l.side,
        account_key: l.account_key,
        department_key: l.department_key,
        counterparty_key: l.counterparty_key,
        amount: String(l.amount),
        description: l.description,
      }),
    );
    const expectedLinesHash = computeLinesHash(linesInput);
    if (expectedLinesHash !== r.lines_hash) {
      return c.json({
        data: {
          status: "broken" as const,
          journal_key: journalKey,
          total_revisions: revisions.length,
          verified_count: verified,
          first_break: {
            revision: r.revision,
            field: "lines_hash",
            expected: expectedLinesHash,
            actual: r.lines_hash,
          },
        },
      }, 200);
    }

    // Verify revision_hash
    const expectedRevHash = computeRevisionHash({
      prev_revision_hash: r.prev_revision_hash,
      journal_key: r.key,
      revision: r.revision,
      journal_type: r.journal_type,
      slip_category: r.slip_category,
      adjustment_flag: r.adjustment_flag,
      description: r.description,
      lines_hash: r.lines_hash,
    });
    if (expectedRevHash !== r.revision_hash) {
      return c.json({
        data: {
          status: "broken" as const,
          journal_key: journalKey,
          total_revisions: revisions.length,
          verified_count: verified,
          first_break: {
            revision: r.revision,
            field: "revision_hash",
            expected: expectedRevHash,
            actual: r.revision_hash,
          },
        },
      }, 200);
    }

    prevRevHash = r.revision_hash;
    verified++;
  }

  return c.json({
    data: {
      status: "valid" as const,
      journal_key: journalKey,
      total_revisions: revisions.length,
      verified_count: verified,
      first_break: null,
    },
  }, 200);
});

export default app;
