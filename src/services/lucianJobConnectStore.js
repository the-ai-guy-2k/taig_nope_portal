'use strict';

/* Lucian Job Connect — server-side store (MVP).
   Live data lives in the mounted volume (nebula_local) so it survives
   container rebuilds and never dirties the git working tree.
   First run seeds from the committed data/lucian-job-connect.json.
   Resume files are stored as base64 data URLs on the worker record,
   capped at 5 MB — MVP scale only. */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const LIVE_PATH = path.join(__dirname, '..', '..', 'nebula_local', 'lucian-job-connect.json');
const SEED_PATH = path.join(__dirname, '..', '..', 'data', 'lucian-job-connect.json');

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const RESUME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const INDUSTRIES = [
  'Tourism & Hospitality',
  'Construction',
  'Retail',
  'Agriculture & Fishing',
  'Transport',
  'Healthcare',
  'Education',
  'Food & Drink',
  'Cleaning & Maintenance',
  'Security',
  'Office & Admin',
  'Trades',
  'Other',
];

/* Skill tag vocabulary. Each tag has keywords the rules tagger looks for
   in the job description + position + industry text. */
const SKILL_TAGS = [
  { tag: 'cooking', keywords: ['cook', 'chef', 'kitchen', 'food prep', 'bake', 'baker'] },
  { tag: 'cleaning', keywords: ['clean', 'janitor', 'maid'] },
  { tag: 'housekeeping', keywords: ['housekeep', 'hotel room', 'change linen', 'guesthouse'] },
  { tag: 'driving', keywords: ['driver', 'drive', 'chauffeur', 'licence', 'license'] },
  { tag: 'delivery', keywords: ['delivery', 'courier', 'deliver'] },
  { tag: 'customer-service', keywords: ['customer', 'front desk', 'reception', 'guest'] },
  { tag: 'cash-handling', keywords: ['cashier', 'cash', 'till', 'checkout', 'pos'] },
  { tag: 'carpentry', keywords: ['carpenter', 'wood', 'cabinet'] },
  { tag: 'plumbing', keywords: ['plumber', 'plumbing', 'pipe'] },
  { tag: 'electrical', keywords: ['electrician', 'electrical', 'wiring'] },
  { tag: 'painting', keywords: ['painter', 'painting'] },
  { tag: 'gardening', keywords: ['garden', 'landscap', 'lawn', 'grounds'] },
  { tag: 'fishing', keywords: ['fish', 'fisher', 'boat crew'] },
  { tag: 'farming', keywords: ['farm', 'agriculture', 'harvest', 'crop'] },
  { tag: 'front-desk', keywords: ['front desk', 'receptionist', 'concierge'] },
  { tag: 'tour-guide', keywords: ['tour guide', 'tour'] },
  { tag: 'bartending', keywords: ['bartender', 'bar'] },
  { tag: 'waiting', keywords: ['waiter', 'waitress', 'server', 'serving'] },
  { tag: 'security', keywords: ['security', 'guard'] },
  { tag: 'caregiving', keywords: ['caregiver', 'elderly', 'nurse aide', 'home care'] },
  { tag: 'childcare', keywords: ['child', 'babysit', 'nanny', 'daycare'] },
  { tag: 'teaching', keywords: ['teach', 'tutor', 'teacher'] },
  { tag: 'computer-skills', keywords: ['computer', 'data entry', 'typing', 'excel', 'office software'] },
  { tag: 'social-media', keywords: ['social media', 'marketing', 'content'] },
  { tag: 'sales', keywords: ['sales', 'sell', 'retail assistant'] },
  { tag: 'warehouse', keywords: ['warehouse', 'stock', 'inventory'] },
  { tag: 'mechanic', keywords: ['mechanic', 'vehicle repair', 'auto repair'] },
  { tag: 'welding', keywords: ['weld'] },
  { tag: 'sewing', keywords: ['sew', 'tailor', 'seamstress'] },
  { tag: 'construction-general', keywords: ['construction', 'labour', 'labor', 'site work', 'mason', 'concrete', 'build'] },
  { tag: 'hospitality', keywords: ['hotel', 'resort', 'guesthouse'] },
];

const SKILL_NAMES = SKILL_TAGS.map((entry) => entry.tag);
const SKILL_SET = new Set(SKILL_NAMES);

class ValidationError extends Error {}

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value, maxLen) {
  let text = String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  text = text.replace(/<[^>]*>/g, '').trim().replace(/\s+/g, ' ');
  if (text.length > maxLen) text = text.slice(0, maxLen).trim();
  return text;
}

function cleanTags(values, maxCount) {
  if (!Array.isArray(values)) return [];
  const out = [];
  for (const raw of values) {
    const tag = String(raw || '').trim().toLowerCase();
    if (SKILL_SET.has(tag) && !out.includes(tag)) out.push(tag);
    if (out.length >= maxCount) break;
  }
  return out;
}

/* Rules tagger: scan text for each tag's keywords. Returns up to 8 tags,
   in vocabulary order. This is the MVP stand-in for AI tagging. */
function tagText(text) {
  const hay = String(text || '').toLowerCase();
  const found = [];
  for (const entry of SKILL_TAGS) {
    if (entry.keywords.some((word) => hay.includes(word))) {
      found.push(entry.tag);
      if (found.length >= 8) break;
    }
  }
  return found;
}

function loadSeed() {
  try {
    return JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  } catch (err) {
    return { jobs: [], workers: [], connections: [] };
  }
}

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(LIVE_PATH, 'utf8'));
    if (parsed && Array.isArray(parsed.jobs) && Array.isArray(parsed.workers)) {
      if (!Array.isArray(parsed.connections)) parsed.connections = [];
      return parsed;
    }
  } catch (err) {
    /* No live file yet (or corrupt) — fall through to seed. */
  }
  const seed = loadSeed();
  if (!Array.isArray(seed.connections)) seed.connections = [];
  return seed;
}

function save(state) {
  const dir = path.dirname(LIVE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${LIVE_PATH}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, LIVE_PATH);
}

function publicJob(job) {
  return {
    id: job.id,
    industry: job.industry,
    position: job.position,
    description: job.description,
    tags: job.tags,
    tagsAi: job.tagsAi,
    tagsSelected: job.tagsSelected,
    resumeRequired: !!job.resumeRequired,
    sample: !!job.sample,
    createdAt: job.createdAt,
  };
}

function publicWorker(worker) {
  return {
    id: worker.id,
    name: worker.name,
    skills: worker.skills,
    hasResume: !!worker.resume,
    resumeName: worker.resume ? worker.resume.name : null,
    sample: !!worker.sample,
    createdAt: worker.createdAt,
  };
}

function validateJob(body) {
  const industry = cleanText(body.industry, 60);
  if (!INDUSTRIES.includes(industry)) {
    throw new ValidationError('Pick an industry from the list.');
  }
  const position = cleanText(body.position, 100);
  if (position.length < 3) {
    throw new ValidationError('Position needs at least 3 characters.');
  }
  const description = cleanText(body.description, 2000);
  if (description.length < 20) {
    throw new ValidationError('Description needs at least 20 characters.');
  }
  const contactName = cleanText(body.contactName, 100);
  const contactPhone = cleanText(body.contactPhone, 40);
  const contactEmail = cleanText(body.contactEmail, 120);
  if (!contactPhone && !contactEmail) {
    throw new ValidationError('Give a phone number or an email so workers can reach you.');
  }
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    throw new ValidationError('That email does not look right.');
  }
  const tagsSelected = cleanTags(body.tagsSelected, 8);
  const tagsAi = tagText(`${position} ${industry} ${description}`);
  const tags = [...new Set([...tagsAi, ...tagsSelected])];
  return {
    industry,
    position,
    description,
    contactName,
    contactPhone,
    contactEmail,
    resumeRequired: body.resumeRequired === true,
    tagsSelected,
    tagsAi,
    tags,
  };
}

function validateWorker(body) {
  const name = cleanText(body.name, 100);
  if (name.length < 2) {
    throw new ValidationError('Name needs at least 2 characters.');
  }
  const contactPhone = cleanText(body.contactPhone, 40);
  const contactEmail = cleanText(body.contactEmail, 120);
  if (!contactPhone && !contactEmail) {
    throw new ValidationError('Give a phone number or an email so employers can reach you.');
  }
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    throw new ValidationError('That email does not look right.');
  }
  const skills = cleanTags(body.skills, 12);
  if (!skills.length) {
    throw new ValidationError('Pick at least one skill.');
  }
  let resume = null;
  if (body.resume) {
    const dataUrl = String(body.resume.dataUrl || '');
    const resumeName = cleanText(body.resume.name, 120);
    const resumeType = String(body.resume.type || '');
    const match = /^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match || !RESUME_TYPES.has(match[1]) || !RESUME_TYPES.has(resumeType)) {
      throw new ValidationError('Resume must be a PDF or Word file.');
    }
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > MAX_RESUME_BYTES || bytes.length === 0) {
      throw new ValidationError('Resume must be under 5 MB.');
    }
    resume = { name: resumeName || 'resume', size: bytes.length, type: match[1], dataUrl };
  }
  return { name, contactPhone, contactEmail, skills, resume };
}

function createJob(body) {
  const fields = validateJob(body);
  const state = load();
  const job = {
    id: `job-${randomUUID().slice(0, 8)}`,
    ...fields,
    createdAt: nowIso(),
  };
  state.jobs.unshift(job);
  save(state);
  return publicJob(job);
}

function createWorker(body) {
  const fields = validateWorker(body);
  const state = load();
  const worker = {
    id: `wkr-${randomUUID().slice(0, 8)}`,
    ...fields,
    createdAt: nowIso(),
  };
  state.workers.unshift(worker);
  save(state);
  return publicWorker(worker);
}

function listJobs() {
  return load().jobs.map(publicJob);
}

function listWorkers() {
  return load().workers.map(publicWorker);
}

function scoreMatch(jobTags, workerSkills) {
  const shared = workerSkills.filter((skill) => jobTags.includes(skill));
  return { score: shared.length, shared };
}

function matchesForJob(jobId) {
  const state = load();
  const job = state.jobs.find((entry) => entry.id === jobId);
  if (!job) return null;
  const ranked = state.workers
    .map((worker) => {
      const { score, shared } = scoreMatch(job.tags, worker.skills);
      return { worker: publicWorker(worker), score, sharedTags: shared };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.worker.createdAt.localeCompare(a.worker.createdAt));
  return { job: publicJob(job), workers: ranked };
}

function matchesForWorker(workerId) {
  const state = load();
  const worker = state.workers.find((entry) => entry.id === workerId);
  if (!worker) return null;
  const ranked = state.jobs
    .map((job) => {
      const { score, shared } = scoreMatch(job.tags, worker.skills);
      return { job: publicJob(job), score, sharedTags: shared };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.job.createdAt.localeCompare(a.job.createdAt));
  return { worker: publicWorker(worker), jobs: ranked };
}

function connect(body) {
  const jobId = cleanText(body.jobId, 40);
  const workerId = cleanText(body.workerId, 40);
  const role = cleanText(body.role, 20);
  if (role !== 'employer' && role !== 'worker') {
    throw new ValidationError('Say whether you are the employer or the worker.');
  }
  const state = load();
  const job = state.jobs.find((entry) => entry.id === jobId);
  const worker = state.workers.find((entry) => entry.id === workerId);
  if (!job || !worker) {
    throw new ValidationError('That job or worker was not found.');
  }
  const connection = {
    id: `con-${randomUUID().slice(0, 8)}`,
    jobId,
    workerId,
    by: role,
    createdAt: nowIso(),
  };
  state.connections.unshift(connection);
  save(state);
  if (role === 'employer') {
    return {
      connectionId: connection.id,
      otherSide: {
        name: worker.name,
        phone: worker.contactPhone,
        email: worker.contactEmail,
        hasResume: !!worker.resume,
        resumeName: worker.resume ? worker.resume.name : null,
        resumeDataUrl: worker.resume ? worker.resume.dataUrl : null,
      },
    };
  }
  return {
    connectionId: connection.id,
    otherSide: {
      name: job.contactName || job.position,
      phone: job.contactPhone,
      email: job.contactEmail,
    },
  };
}

module.exports = {
  INDUSTRIES,
  SKILL_NAMES,
  ValidationError,
  tagText,
  createJob,
  createWorker,
  listJobs,
  listWorkers,
  matchesForJob,
  matchesForWorker,
  connect,
  MAX_RESUME_BYTES,
};
