import { createApp } from "@/lib/create-app";
import { createRoute, z } from "@hono/zod-openapi";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { requireTenant, requireAuth, requireRole } from "@/middleware/guards";
import {
  computeLinesHash,
  computeRevisionHash,
  computeHeaderHash,
  PRE_CHAIN_HASH,
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
  status: z.enum(["valid", "broken", "pre_chain"]),
  total_headers: z.number(),
  verified_count: z.number(),
  first_break: z
    .object({
      sequence_no: z.number(),
      idempotency_code: z.string(),
      expected_hash: z.string(),
      actual_hash: z.string(),
    })
    .nullable(),
});

const revisionChainResultSchema = z.object({
  status: z.enum(["valid", "broken", "pre_chain"]),
  idempotency_code: z.string(),
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
  const tenantId = c.get("tenantId");

  const { rows } = await db.execute(sql`
    SELECT idempotency_code, tenant_id, sequence_no, prev_header_hash, header_hash, created_at
    FROM "${sql.raw(S)}"."journal_header"
    WHERE tenant_id = ${tenantId}
    ORDER BY sequence_no ASC
  `);

  type HeaderRow = {
    idempotency_code: string;
    tenant_id: string;
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

  // All PRE_CHAIN?
  const allPreChain = headers.every((h) => h.header_hash === PRE_CHAIN_HASH);
  if (allPreChain) {
    return c.json({
      data: {
        status: "pre_chain" as const,
        total_headers: headers.length,
        verified_count: 0,
        first_break: null,
      },
    });
  }

  let verified = 0;
  let prevHash = "";

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];

    if (h.header_hash === PRE_CHAIN_HASH) {
      prevHash = h.header_hash;
      continue;
    }

    // Verify prev_header_hash linkage
    if (i > 0 && h.prev_header_hash !== prevHash) {
      return c.json({
        data: {
          status: "broken" as const,
          total_headers: headers.length,
          verified_count: verified,
          first_break: {
            sequence_no: h.sequence_no,
            idempotency_code: h.idempotency_code,
            expected_hash: prevHash,
            actual_hash: h.prev_header_hash,
          },
        },
      });
    }

    // Recompute hash
    const expected = computeHeaderHash({
      prev_header_hash: h.prev_header_hash,
      tenant_id: h.tenant_id,
      sequence_no: h.sequence_no,
      idempotency_code: h.idempotency_code,
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
            idempotency_code: h.idempotency_code,
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

// ── GET /revision-chain/:code ──

const revisionChainRoute = createRoute({
  method: "get",
  path: "/revision-chain/{code}",
  tags: ["Integrity"],
  summary: "Verify the revision chain for a specific journal",
  request: {
    params: z.object({ code: z.string() }),
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
  const tenantId = c.get("tenantId");
  const { code } = c.req.valid("param");

  // Get all revisions ordered
  const { rows: revRows } = await db.execute(sql`
    SELECT id, idempotency_code, revision, posted_date, journal_type,
      slip_category, adjustment_flag, description, source_system,
      lines_hash, prev_revision_hash, revision_hash
    FROM "${sql.raw(S)}"."journal"
    WHERE idempotency_code = ${code} AND tenant_id = ${tenantId}
    ORDER BY revision ASC
  `);

  type RevRow = {
    id: string;
    idempotency_code: string;
    revision: number;
    posted_date: Date;
    journal_type: string;
    slip_category: string;
    adjustment_flag: string;
    description: string | null;
    source_system: string | null;
    lines_hash: string;
    prev_revision_hash: string;
    revision_hash: string;
  };
  const revisions = revRows as RevRow[];

  if (revisions.length === 0) {
    return c.json({ error: "Journal not found" }, 404) as never;
  }

  const allPreChain = revisions.every(
    (r) => r.revision_hash === PRE_CHAIN_HASH,
  );
  if (allPreChain) {
    return c.json({
      data: {
        status: "pre_chain" as const,
        idempotency_code: code,
        total_revisions: revisions.length,
        verified_count: 0,
        first_break: null,
      },
    }, 200);
  }

  let verified = 0;
  let prevRevHash = "";

  for (let i = 0; i < revisions.length; i++) {
    const r = revisions[i];

    if (r.revision_hash === PRE_CHAIN_HASH) {
      prevRevHash = r.revision_hash;
      continue;
    }

    // Verify chain linkage
    if (i > 0 && r.prev_revision_hash !== prevRevHash) {
      return c.json({
        data: {
          status: "broken" as const,
          idempotency_code: code,
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
      SELECT line_group, side, account_code, department_code, counterparty_code,
        tax_class_code, tax_rate, is_reduced, amount, description
      FROM "${sql.raw(S)}"."journal_line"
      WHERE journal_id = ${r.id}
      ORDER BY line_group, side
    `);
    const linesInput: LineHashInput[] = (lineRows as JournalLineRow[]).map(
      (l) => ({
        line_group: l.line_group,
        side: l.side,
        account_code: l.account_code,
        department_code: l.department_code,
        counterparty_code: l.counterparty_code,
        tax_class_code: l.tax_class_code,
        tax_rate: l.tax_rate,
        is_reduced: l.is_reduced,
        amount: String(l.amount),
        description: l.description,
      }),
    );
    const expectedLinesHash = computeLinesHash(linesInput);
    if (expectedLinesHash !== r.lines_hash) {
      return c.json({
        data: {
          status: "broken" as const,
          idempotency_code: code,
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
    const postedDateIso =
      r.posted_date instanceof Date
        ? r.posted_date.toISOString()
        : String(r.posted_date);
    const expectedRevHash = computeRevisionHash({
      prev_revision_hash: r.prev_revision_hash,
      idempotency_code: r.idempotency_code,
      revision: r.revision,
      posted_date: postedDateIso,
      journal_type: r.journal_type,
      slip_category: r.slip_category,
      adjustment_flag: r.adjustment_flag,
      description: r.description,
      source_system: r.source_system,
      lines_hash: r.lines_hash,
    });
    if (expectedRevHash !== r.revision_hash) {
      return c.json({
        data: {
          status: "broken" as const,
          idempotency_code: code,
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
      idempotency_code: code,
      total_revisions: revisions.length,
      verified_count: verified,
      first_break: null,
    },
  }, 200);
});

export default app;
