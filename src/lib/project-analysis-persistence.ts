import type { JobAnalysis } from "@/lib/job-schema";

export function buildProjectAnalysisUpdateData(analysis: JobAnalysis) {
  const structuredJson = JSON.stringify(analysis);

  return {
    name: analysis.projectName,
    clientCompany: analysis.jobBrief.clientCompany,
    roleTitle: analysis.jobBrief.roleTitle,
    jobBrief: {
      update: {
        roleTitle: analysis.jobBrief.roleTitle,
        clientCompany: analysis.jobBrief.clientCompany,
        salaryBudget: analysis.jobBrief.salaryBudget,
        reportingLine: analysis.jobBrief.reportingLine,
        businessContext: analysis.jobBrief.businessContext,
        structuredJson,
      },
    },
    talentPersona: {
      update: {
        mustHaveJson: JSON.stringify(analysis.talentPersona.mustHave),
        niceToHaveJson: JSON.stringify(analysis.talentPersona.strongMatch),
        riskJson: JSON.stringify(analysis.talentPersona.riskSignals),
        structuredJson,
      },
    },
    searchMap: {
      update: {
        targetIndustriesJson: JSON.stringify(analysis.searchMap.targetIndustries),
        targetCompaniesJson: JSON.stringify(analysis.searchMap.targetCompanies),
        targetTitlesJson: JSON.stringify(analysis.searchMap.targetTitles),
        keywordsJson: JSON.stringify(analysis.searchMap.keywords),
        exclusionsJson: JSON.stringify(analysis.searchMap.excludedIndustries),
        structuredJson,
      },
    },
  } as const;
}
