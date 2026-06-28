'use strict';

const fs = require('fs');
const path = require('path');
const { loadAndValidate, getJobOrderById } = require('../models/loader');
const { getPrimaryJobOrderView } = require('./jobOrderService');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_PRESERVATION_DIR = path.join(ROOT, 'nebula_local');
const REPORTS_DIR = path.join(ROOT, 'docs', 'reports');

const ARTIFACTS = {
  currentJobOrder: 'current_job_order.json',
  minorityReportCurrent: 'minority_report_current.md',
  minorityReportPrevious: 'minority_report_previous.md',
  currentAci: 'current_aci.json',
  completionSummary: 'completion_summary.json',
  restoreStatus: 'restore_status.json',
};

const APPLICATION_VERSION = 'Operational Awareness (ACI-005+)';

function getPreservationDir() {
  return process.env.PRESERVATION_DIR || DEFAULT_PRESERVATION_DIR;
}

function ensurePreservationDir() {
  const dir = getPreservationDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function artifactPath(name) {
  return path.join(getPreservationDir(), ARTIFACTS[name]);
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function readJsonFileSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return readJsonFile(filePath);
  } catch {
    return null;
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function writeTextFile(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
}

function formatMinorityReportMarkdown(report, label) {
  if (!report) {
    return `# Minority Report — ${label}\n\n_No report on file._\n`;
  }

  return [
    `# Minority Report — ${label}`,
    '',
    `**ID:** ${report.id}`,
    `**Job Order:** ${report.job_order_id}`,
    `**Title:** ${report.title}`,
    `**Status:** ${report.status}`,
    `**Updated:** ${report.updated_at}`,
    '',
    '## Mission',
    report.mission || '—',
    '',
    '## Current Phase',
    report.current_phase || '—',
    '',
    '## Human Summary',
    report.human_summary || report.content || '—',
    '',
    '## Current Truth',
    report.current_truth || '—',
    '',
    '## Completed',
    report.completed || '—',
    '',
    '## Remaining',
    report.remaining || '—',
    '',
    '## Risk',
    report.risk || '—',
    '',
    '## Next Truth',
    report.next_truth || '—',
    '',
    '## Next Action',
    report.next_action || '—',
    '',
    '## Target',
    report.target || '—',
    '',
  ].join('\n');
}

function getLatestCompletionReportSummary() {
  if (!fs.existsSync(REPORTS_DIR)) {
    return null;
  }

  const files = fs.readdirSync(REPORTS_DIR)
    .filter((name) => /^ACI-\d{3}-completion-report\.md$/.test(name))
    .sort();

  if (!files.length) {
    return null;
  }

  const latest = files[files.length - 1];
  const content = fs.readFileSync(path.join(REPORTS_DIR, latest), 'utf8');
  const titleMatch = content.match(/\*\*Title:\*\*\s*(.+)/);
  const aciMatch = latest.match(/ACI-(\d{3})/);
  const statusMatch = content.match(/\*\*Status:\*\*\s*(.+)/);

  return {
    file: latest,
    aci: aciMatch ? `ACI-${aciMatch[1]}` : latest,
    title: titleMatch ? titleMatch[1].trim() : latest,
    status: statusMatch ? statusMatch[1].trim() : 'unknown',
    summary: content.split('## Summary')[1]?.split('##')[0]?.trim() || '',
    preserved_at: new Date().toISOString(),
  };
}

function getCurrentAciSummary(collections) {
  const inProgress = collections.aci_history
    .filter((aci) => aci.status === 'in_progress')
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  if (inProgress.length) {
    return {
      id: inProgress[0].id,
      number: inProgress[0].number,
      title: inProgress[0].title,
      status: inProgress[0].status,
      job_order_id: inProgress[0].job_order_id,
      source: 'aci_history',
    };
  }

  const latestReport = getLatestCompletionReportSummary();
  if (!latestReport) {
    return {
      number: 'ACI-001',
      title: 'Repository Foundation',
      status: 'complete',
      source: 'default',
    };
  }

  const nextNumber = String(parseInt(latestReport.aci.replace('ACI-', ''), 10) + 1).padStart(3, '0');
  return {
    number: `ACI-${nextNumber}`,
    title: 'Next ACI per approved AEP',
    status: 'planned',
    previous_completed: latestReport.aci,
    source: 'aep_sequence',
  };
}

function buildSnapshotFromRepository() {
  const collections = loadAndValidate();
  const view = getPrimaryJobOrderView();
  const jobOrder = view?.jobOrder || collections.job_orders[0] || null;
  const timestamp = new Date().toISOString();

  const currentReport = view?.minorityReport || null;
  const previousReport = view?.minorityReportPrevious || null;

  return {
    preserved_at: timestamp,
    application_version: APPLICATION_VERSION,
    current_job_order: jobOrder,
    minority_report_current: currentReport,
    minority_report_previous: previousReport,
    current_aci: getCurrentAciSummary(collections),
    completion_summary: getLatestCompletionReportSummary(),
    restore_status: {
      last_preserved: timestamp,
      restoration_available: true,
      current_job_order_id: jobOrder?.id || null,
      current_job_order_title: jobOrder?.title || null,
      current_aci: getCurrentAciSummary(collections).number,
      application_version: APPLICATION_VERSION,
      status: 'preserved',
    },
  };
}

function savePreservationSnapshot() {
  ensurePreservationDir();
  const snapshot = buildSnapshotFromRepository();

  writeJsonFile(artifactPath('currentJobOrder'), snapshot.current_job_order);
  writeTextFile(
    artifactPath('minorityReportCurrent'),
    formatMinorityReportMarkdown(snapshot.minority_report_current, 'Current'),
  );
  writeTextFile(
    artifactPath('minorityReportPrevious'),
    formatMinorityReportMarkdown(snapshot.minority_report_previous, 'Previous'),
  );
  writeJsonFile(artifactPath('currentAci'), snapshot.current_aci);
  writeJsonFile(artifactPath('completionSummary'), snapshot.completion_summary);
  writeJsonFile(artifactPath('restoreStatus'), snapshot.restore_status);

  return snapshot;
}

function loadLatestSnapshot() {
  const dir = getPreservationDir();
  if (!fs.existsSync(dir)) {
    return null;
  }

  const restoreStatus = readJsonFileSafe(artifactPath('restoreStatus'));
  if (!restoreStatus) {
    return null;
  }

  return {
    preserved_at: restoreStatus.last_preserved || null,
    application_version: restoreStatus.application_version || null,
    current_job_order: readJsonFileSafe(artifactPath('currentJobOrder')),
    minority_report_current_md: fs.existsSync(artifactPath('minorityReportCurrent'))
      ? fs.readFileSync(artifactPath('minorityReportCurrent'), 'utf8')
      : null,
    minority_report_previous_md: fs.existsSync(artifactPath('minorityReportPrevious'))
      ? fs.readFileSync(artifactPath('minorityReportPrevious'), 'utf8')
      : null,
    current_aci: readJsonFileSafe(artifactPath('currentAci')),
    completion_summary: readJsonFileSafe(artifactPath('completionSummary')),
    restore_status: restoreStatus,
  };
}

function validateSnapshot(snapshot = loadLatestSnapshot()) {
  const errors = [];

  if (!snapshot) {
    return { valid: false, errors: ['No preservation snapshot exists'], snapshot: null };
  }

  if (!snapshot.restore_status) {
    errors.push('Missing restore_status');
  }

  if (!snapshot.current_job_order) {
    errors.push('Missing or invalid current_job_order.json');
  }

  if (!snapshot.current_aci) {
    errors.push('Missing or invalid current_aci.json');
  }

  if (!snapshot.minority_report_current_md) {
    errors.push('Missing minority_report_current.md');
  }

  if (!fs.existsSync(artifactPath('minorityReportPrevious'))) {
    errors.push('Missing minority_report_previous.md');
  }

  return {
    valid: errors.length === 0,
    errors,
    snapshot,
  };
}

function restoreSnapshot() {
  const validation = validateSnapshot();

  if (!validation.snapshot) {
    return {
      restored: false,
      message: 'No preservation snapshot found.',
      snapshot: null,
    };
  }

  if (!validation.valid) {
    return {
      restored: false,
      message: 'Preservation snapshot failed validation.',
      errors: validation.errors,
      snapshot: validation.snapshot,
    };
  }

  const timestamp = new Date().toISOString();
  const restoreStatus = {
    ...validation.snapshot.restore_status,
    last_restored: timestamp,
    status: 'restored',
    restoration_available: true,
  };

  writeJsonFile(artifactPath('restoreStatus'), restoreStatus);

  return {
    restored: true,
    message: 'Preservation snapshot loaded. Repository data was not modified.',
    snapshot: {
      ...validation.snapshot,
      restore_status: restoreStatus,
    },
  };
}

function detectPreservation() {
  const dir = getPreservationDir();
  const exists = fs.existsSync(dir);
  const snapshot = exists ? loadLatestSnapshot() : null;

  return {
    directory: dir,
    exists,
    artifacts_found: exists
      ? Object.values(ARTIFACTS).filter((file) => fs.existsSync(path.join(dir, file)))
      : [],
    snapshot_available: Boolean(snapshot),
  };
}

function initializeOnStartup() {
  const detection = detectPreservation();
  let restoration = null;

  if (detection.snapshot_available) {
    restoration = restoreSnapshot();
  }

  let saved = null;
  try {
    saved = savePreservationSnapshot();
  } catch (err) {
    return {
      detection,
      restoration,
      save_error: err.message,
      display: buildDisplayContext(detection, restoration, null),
    };
  }

  return {
    detection,
    restoration,
    saved,
    display: buildDisplayContext(detection, restoration, saved),
  };
}

function buildDisplayContext(detection, restoration, saved) {
  const snapshot = restoration?.snapshot || saved || loadLatestSnapshot();
  const status = snapshot?.restore_status || saved?.restore_status || null;

  return {
    available: detection.snapshot_available || Boolean(saved),
    last_preserved: status?.last_preserved || saved?.preserved_at || null,
    last_restored: status?.last_restored || null,
    restoration_status: status?.status || (detection.snapshot_available ? 'detected' : 'none'),
    current_job_order_id: status?.current_job_order_id || snapshot?.current_job_order?.id || null,
    current_job_order_title: status?.current_job_order_title || snapshot?.current_job_order?.title || null,
    current_aci: status?.current_aci || snapshot?.current_aci?.number || null,
    application_version: status?.application_version || APPLICATION_VERSION,
    message: restoration?.restored
      ? 'Local preservation artifacts detected. Execution context restored for display.'
      : detection.snapshot_available
        ? 'Local preservation artifacts detected.'
        : 'No prior local preservation snapshot. Initial snapshot created.',
  };
}

function getDisplayContext() {
  const detection = detectPreservation();
  const snapshot = loadLatestSnapshot();
  return buildDisplayContext(detection, snapshot ? { snapshot, restored: false } : null, null);
}

module.exports = {
  ARTIFACTS,
  APPLICATION_VERSION,
  getPreservationDir,
  savePreservationSnapshot,
  loadLatestSnapshot,
  validateSnapshot,
  restoreSnapshot,
  detectPreservation,
  initializeOnStartup,
  getDisplayContext,
  formatMinorityReportMarkdown,
};
