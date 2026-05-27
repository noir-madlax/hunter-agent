/*
 * Run this in an authenticated PERSOL/Gllue browser console while
 * `node persol_export_server.js persol-export-20260523-hr-admin-full` is running.
 *
 * It exports expanded relation records for candidate experience, education and project
 * tables into candidate_relation_bulk.jsonl through the local ingest server.
 */
(async () => {
  const LOCAL = "http://127.0.0.1:8787";
  const baseGql = "function_id__or=10";
  const pageSize = 100;
  const maxPagesPerSegment = 100;
  const relationFields = [
    "candidateexperience_set__client",
    "candidateexperience_set__client____name__",
    "candidateexperience_set__title",
    "candidateexperience_set__function_normal",
    "candidateexperience_set__function_normal_v8",
    "candidateexperience_set__description",
    "candidateexperience_set__job_description",
    "candidateexperience_set__startDate",
    "candidateexperience_set__endDate",
    "candidateexperience_set__dateFrom",
    "candidateexperience_set__dateTo",
    "candidateeducation_set__school",
    "candidateeducation_set__school____name__",
    "candidateeducation_set__university",
    "candidateeducation_set__major",
    "candidateeducation_set__degree",
    "candidateeducation_set__education",
    "candidateeducation_set__startDate",
    "candidateeducation_set__endDate",
    "candidateeducation_set__dateFrom",
    "candidateeducation_set__dateTo",
    "candidateproject_set__name",
    "candidateproject_set__title",
    "candidateproject_set__role",
    "candidateproject_set__description",
    "candidateproject_set__responsibility",
    "candidateproject_set__achievement",
    "candidateproject_set__startDate",
    "candidateproject_set__endDate",
    "candidateproject_set__dateFrom",
    "candidateproject_set__dateTo",
  ].join(",");

  const state = (window.__persolRelationBulk = {
    status: "running",
    startedAt: new Date().toISOString(),
    totalExpected: null,
    written: 0,
    segment: 0,
    page: 0,
    cursorLt: null,
    errors: [],
  });

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function post(kind, payload) {
    const response = await fetch(`${LOCAL}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, ...payload }),
    });
    if (!response.ok) throw new Error(`local ingest ${response.status}`);
    return response.json();
  }

  async function crmJson(url, attempts = 3) {
    let lastError;
    for (let i = 0; i < attempts; i += 1) {
      try {
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
        return await response.json();
      } catch (error) {
        lastError = error;
        await sleep(700 * (i + 1));
      }
    }
    throw lastError;
  }

  function byId(items) {
    const map = new Map();
    for (const item of Array.isArray(items) ? items : []) {
      if (item && item.id != null) map.set(item.id, item);
    }
    return map;
  }

  function relationUrl(page, cursorLt) {
    const gql = cursorLt ? `${baseGql}&id__lt=${cursorLt}` : baseGql;
    const params = new URLSearchParams({
      check_log: "1",
      gql,
      page: String(page),
      fields: relationFields,
      viewType: "table",
      paginate_by: String(pageSize),
      ordering: "-id",
      order_by_folder: "",
    });
    return `/rest/candidate/simple_list_with_ids?${params.toString()}`;
  }

  function collectRelations(data) {
    const result = data.result || {};
    const candidates = Array.isArray(result.candidate) ? result.candidate : [];
    const experienceById = byId(result.candidateexperience);
    const educationById = byId(result.candidateeducation);
    const projectById = byId(result.candidateproject);
    const clients = Array.isArray(result.client) ? result.client : [];

    return candidates.map((candidate) => ({
      id: candidate.id,
      experiences: (Array.isArray(candidate.candidateexperience_set) ? candidate.candidateexperience_set : [])
        .map((id) => experienceById.get(id))
        .filter(Boolean),
      educations: (Array.isArray(candidate.candidateeducation_set) ? candidate.candidateeducation_set : [])
        .map((id) => educationById.get(id))
        .filter(Boolean),
      projects: (Array.isArray(candidate.candidateproject_set) ? candidate.candidateproject_set : [])
        .map((id) => projectById.get(id))
        .filter(Boolean),
      clients,
    }));
  }

  try {
    let cursorLt = null;
    while (true) {
      state.segment += 1;
      state.cursorLt = cursorLt;
      let lastIdInSegment = null;
      let segmentCount = 0;

      for (let page = 1; page <= maxPagesPerSegment; page += 1) {
        state.page = page;
        const data = await crmJson(relationUrl(page, cursorLt));
        if (state.totalExpected == null) state.totalExpected = data.totalcount || null;
        const ids = Array.isArray(data.ids) ? data.ids : [];
        if (!ids.length) break;

        const records = collectRelations(data);
        await post("relation_bulk", {
          records,
          meta: {
            stage: "relation_bulk",
            segment: state.segment,
            page,
            totalExpected: state.totalExpected,
            written: state.written + records.length,
          },
        });
        state.written += records.length;
        segmentCount += ids.length;
        lastIdInSegment = Math.min(...ids);
        await sleep(80);
      }

      await post("status", { status: state });
      if (!lastIdInSegment || segmentCount === 0 || (state.totalExpected && state.written >= state.totalExpected)) break;
      cursorLt = lastIdInSegment;
    }
    state.status = "done";
    state.completedAt = new Date().toISOString();
    await post("status", { status: state });
  } catch (error) {
    state.status = "error";
    state.error = String(error && error.stack ? error.stack : error);
    await post("status", { status: state });
    throw error;
  }
})();
