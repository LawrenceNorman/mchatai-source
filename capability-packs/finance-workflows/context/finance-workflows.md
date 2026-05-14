# Finance Workflows Capability Pack

Use this pack when the user wants a finance analyst workflow, finance operations automation, earnings review, reconciliation support, close support, KYC screening support, valuation review, or market/financial research. Build native mChatAI+ workflows first. Do not present these as Anthropic-managed agents unless an explicit Anthropic bridge is selected elsewhere.

## Positioning

- Name the experience "Finance Workflows for mChatAI+".
- Treat Anthropic's finance-agent release as workflow inspiration and market validation, not as the default runtime dependency.
- Prefer source-backed pipeline templates, DAG pipelines, and agent definitions over hardcoded one-off Swift logic.
- Use existing mChatAI+ surfaces: Packs for discovery, Recipes for quick starts, Pipeline Canvas for editing/running, Harness for generation, Monitor for run history, and ATS artifacts for Vault/AIFeed/AIWrite routing.

## Output Guardrails

Every finance workflow output must:

- State the analysis date or clearly say the date was not available.
- Identify the input company, reporting period, dataset, or source scope.
- Cite source URLs or file names for every material claim.
- Separate observed facts from interpretation.
- Include a "Missing Data / Follow-Up" section when source coverage is incomplete.
- Include a short review note: "Draft analysis for human review. Not investment, tax, legal, accounting, or compliance advice."
- Avoid trading recommendations, price targets, tax filing conclusions, compliance decisions, or final accounting entries unless a human approval gate is explicitly part of the workflow.

## Public Earnings Reviewer Pattern

Recommended sequential pipeline:

1. Convert the user input into a targeted public web search query.
2. Search public sources for earnings release, call transcript, investor deck, SEC filing, and reputable coverage.
3. Synthesize a research report from only the retrieved evidence.
4. Run a validation pass that checks citations, dates, missing data, and disclaimer.
5. Save as `com.mchatai.product.research.report` with `metadata.title` and `metadata.summary`.

The report should include:

- Company and reporting period.
- Source coverage table.
- Key financial metrics found in sources.
- Management commentary.
- Deltas from prior period or guidance when present.
- Risks and watch items.
- Open questions for the operator.
- Review note.

## Operator / SMB Finance Pattern

For private business data, prefer CSV-first workflows before adding custom API providers. Good first workflows:

- Month-end close assistant: ingest exported trial balance, bank activity, invoices, and payments; produce checklist and exceptions.
- GL reconciliation reviewer: identify unmatched rows, timing differences, duplicate-looking entries, and unexplained deltas.
- Cashflow snapshot: summarize inflows, outflows, runway, late payments, and upcoming pressure points.
- Budget variance reviewer: compare budget-versus-actual rows, flag material favorable/unfavorable variances, and produce owner follow-ups.
- AP duplicate payment reviewer: identify duplicate-looking invoices, repeated payments, vendor outliers, and missing support.
- AR aging collections prioritizer: prioritize overdue customer balances, aging/concentration risks, and collections follow-up.
- Invoice/payment anomaly reviewer: flag duplicate invoice numbers, unusual amounts, missing payment references, and vendor/customer outliers.

For private inputs:

- Set `dataSensitivity` to `confidential` or `restricted`.
- Avoid web search unless the user explicitly asks for public enrichment.
- Preserve source file names and row/column references.
- Require human review before changing books, sending notices, filing, approving KYC, or publishing finance statements.

## Pipeline Design Rules

- Do not output raw JSON as the final result.
- Keep the final result human-readable, structured, and artifact-ready.
- Use `builtin.csvTable` for pasted/exported CSV data before asking for new custom parsers.
- Use `builtin.webSearch` for public earnings/market research, with fetched excerpts enabled when possible.
- Use `builtin.llmGenerate` for analyst synthesis and a separate validator/finalizer step when the workflow is financial.
- Use `builtin.saveArtifact` with ATS product metadata for durable outputs.
- Use DAG human-in-loop nodes for close, audit, reconciliation, KYC, valuation, or compliance-adjacent workflows.

## Failure Handling

If sources are thin, contradictory, paywalled, stale, or missing the reporting period, do not guess. Produce a partial report with explicit gaps and suggested follow-up sources. If a workflow receives private accounting data that lacks headers, dates, account identifiers, or currency, ask for the missing fields or mark the analysis as incomplete.
