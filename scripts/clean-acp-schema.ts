import { readFileSync, writeFileSync } from 'fs';

const schemaPath = 'src/db/schema.ts';
let content = readFileSync(schemaPath, 'utf-8');

// Tables to remove (keep acpOfferings)
const tablesToRemove = [
  'acpActivities',
  'acpWalletSnapshots', 
  'acpEpochStats',
  'acpOfferingExperiments',
  'acpOfferingMetrics',
  'acpPriceExperiments',
  'acpCompetitors',
  'acpCompetitorSnapshots',
  'acpState',
  'acpStrategy',
  'acpTasks',
  'acpDecisions',
  'acpMarketing',
  'acpJobs',
];

// Constants/types to remove
const constantsToRemove = [
  'ACP_ACTIVITY_TYPES',
  'AcpActivityType',
  'ACP_EXPERIMENT_STATUSES',
  'AcpExperimentStatus',
  'ACP_PRICE_EXPERIMENT_STATUSES',
  'AcpPriceExperimentStatus',
  'ACP_PILLARS',
  'AcpPillar',
  'ACP_TASK_STATUSES',
  'AcpTaskStatus',
  'ACP_DECISION_TYPES',
  'AcpDecisionType',
  'ACP_MARKETING_STATUSES',
  'AcpMarketingStatus',
  'ACP_STRATEGY_CATEGORIES',
  'AcpStrategyCategory',
  'ACP_JOB_STATUSES',
  'AcpJobStatus',
];

// Remove table definitions
for (const table of tablesToRemove) {
  // Match: export const tableName = sqliteTable("table_name", { ... });
  const regex = new RegExp(
    `export const ${table} = sqliteTable\\([^)]+,\\s*\\{[\\s\\S]*?\\}\\);\\n`,
    'g'
  );
  content = content.replace(regex, '');
}

// Remove type exports
for (const table of tablesToRemove) {
  // Match type exports
  const typeRegex = new RegExp(
    `export type \\w+ = typeof ${table}\\.\\$infer\\w+;\\n`,
    'g'
  );
  content = content.replace(typeRegex, '');
}

// Remove constants
for (const constant of constantsToRemove) {
  // Match: export const CONSTANT = [...] as const;
  const constRegex = new RegExp(
    `export const ${constant} = \\[[^\\]]*\\] as const;\\n`,
    'g'
  );
  content = content.replace(constRegex, '');
  
  // Match: export type TypeName = ...;
  const typeRegex = new RegExp(
    `export type ${constant} = [^;]+;\\n`,
    'g'
  );
  content = content.replace(typeRegex, '');
}

// Remove ACP Operations Control Plane comment block
content = content.replace(
  /\/\/ ={50,}\n\/\/ ACP Operations Control Plane[\s\S]*?\/\/ ={50,}\n/g,
  ''
);

// Remove ACP Jobs comment block
content = content.replace(
  /\/\/ ={50,}\n\/\/ ACP Jobs[\s\S]*?\/\/ ={50,}\n/g,
  ''
);

// Clean up multiple blank lines
content = content.replace(/\n{3,}/g, '\n\n');

writeFileSync(schemaPath, content);
console.log('Schema cleaned');
