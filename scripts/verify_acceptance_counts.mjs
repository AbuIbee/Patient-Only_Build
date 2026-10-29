#!/usr/bin/env node
// MANDATORY FINAL ACCEPTANCE ENFORCEMENT §1 — automated checks that the
// five acceptance registers this engagement maintains contain exactly
// the counts the governing directives require, each with a unique,
// non-duplicated identifier. This script does not judge WHETHER an
// item's disposition is truthful (that is the register's own job,
// cross-checked by hand throughout this engagement) -- it only catches
// drift in COUNT and UNIQUENESS, which is the class of error a human
// re-reading a 300+ line register across many sessions can miss.
//
// Run with: node scripts/verify_acceptance_counts.mjs
// Exits non-zero (and prints exactly what's wrong) on any mismatch.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const oks = [];

function check(label, actual, expected) {
  if (actual === expected) oks.push(`${label}: ${actual} (expected ${expected})`);
  else failures.push(`${label}: got ${actual}, expected ${expected}`);
}

// ---------------------------------------------------------------------
// 1. 92 unique Enterprise requirement IDs — the traceability CSV.
// ---------------------------------------------------------------------
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

const csvPath = path.join(ROOT, 'MyMemoria_Functional_Remediation_001', '28_ENTERPRISE_CAREGIVER_TRACEABILITY_MATRIX.csv');
const csvRows = parseCSV(fs.readFileSync(csvPath, 'utf8'));
const header = csvRows[0];
const dataRows = csvRows.slice(1);
const malformed = dataRows.filter((r) => r.length !== header.length);
const ids92 = dataRows.map((r) => r[0]);
check('92-requirement CSV: well-formed rows (13 fields each)', dataRows.length - malformed.length, 92);
check('92-requirement CSV: malformed-width rows', malformed.length, 0);
check('92-requirement CSV: unique IDs', new Set(ids92).size, 92);

// ---------------------------------------------------------------------
// 2. 19 unique Codex finding IDs — the closure register's own
//    disposition table (§2l), rows "| NN | ... |" where NN is 01-19.
// ---------------------------------------------------------------------
const registerPath = path.join(ROOT, 'docs', 'acceptance', 'ENTERPRISE_MASTER_CLOSURE_REGISTER.md');
const registerText = fs.readFileSync(registerPath, 'utf8');

// Isolate the §2l findings-disposition section specifically (not any
// other numbered table in the register, e.g. the 12-case governance
// lifecycle table, which also has single-digit numbered rows).
const section2lStart = registerText.indexOf('## 2l.');
const section2lEnd = registerText.indexOf('\n## 2m.', section2lStart);
const section2l = registerText.slice(section2lStart, section2lEnd === -1 ? undefined : section2lEnd);
const findingRows = [...section2l.matchAll(/^\|\s*(\d{2}|—)\s*\|([^|]+)\|([^|]+)\|([^|]+)\|/gm)]
  .map((m) => ({ id: m[1].trim(), finding: m[2].trim(), status: m[3].trim(), evidence: m[4].trim() }));
const numberedFindingIds = findingRows.filter((r) => r.id !== '—').map((r) => r.id);
check('19 Codex findings: unique numbered rows found in register §2l', new Set(numberedFindingIds).size, 19);
check('19 Codex findings: no duplicate finding IDs in §2l', numberedFindingIds.length, new Set(numberedFindingIds).size);

// Legitimate disposition vocabulary — a row whose Status column doesn't
// start with one of these is either a typo or an unauthorized ad-hoc
// status inconsistent with the rest of the engagement's own discipline.
const ALLOWED_DISPOSITIONS = ['FIXED', 'PARTIAL', 'PARTIALLY', 'UNCHANGED', 'ALREADY', 'BLOCKED', 'UNVERIFIED', 'CONFIRMED'];
const illegitimateDispositions = findingRows.filter((r) => !ALLOWED_DISPOSITIONS.some((w) => r.status.toUpperCase().startsWith(w)));
check('19 Codex findings: every row uses a legitimate disposition lead-word', illegitimateDispositions.length, 0);
if (illegitimateDispositions.length) {
  for (const r of illegitimateDispositions) failures.push(`  -> finding ${r.id} ("${r.finding}") has non-standard status: "${r.status.slice(0, 60)}"`);
}

// Required evidence reference — every row must cite SOMETHING concrete
// (a migration number, a commit SHA, a test file, or a pointer to
// another authoritative section/document) rather than an unsupported
// bare assertion.
const EVIDENCE_PATTERN = /migrations? \d+|`[^`]+`|\.test\.ts|register §|owner decision register|§\d|NOT AUDITED|NOT ATTEMPTED|commit/i;
const missingEvidence = findingRows.filter((r) => !EVIDENCE_PATTERN.test(r.evidence));
check('19 Codex findings: every row cites a concrete evidence reference', missingEvidence.length, 0);
if (missingEvidence.length) {
  for (const r of missingEvidence) failures.push(`  -> finding ${r.id} ("${r.finding}") has no recognizable evidence citation`);
}

// ---------------------------------------------------------------------
// 3. 60 navigation destinations across the 5 Enterprise offices — read
//    directly from each dashboard's own nav-array source, not
//    hardcoded, so this check breaks (correctly) if a destination is
//    added or removed without updating the register.
// ---------------------------------------------------------------------
function countNavKeys(filePath, arrayVarName) {
  const text = fs.readFileSync(path.join(ROOT, filePath), 'utf8');
  const start = text.indexOf(`const ${arrayVarName}`);
  if (start === -1) throw new Error(`Could not find ${arrayVarName} in ${filePath}`);
  // Skip past any `: Type<...>[]` annotation between the name and `=`
  // -- its own `[]` is not the array literal's opening bracket.
  const equalsIdx = text.indexOf('=', start);
  const arrayStart = text.indexOf('[', equalsIdx);
  let depth = 0, end = arrayStart;
  for (let i = arrayStart; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = text.slice(arrayStart, end + 1);
  return [...body.matchAll(/key:\s*'[^']+'/g)].length;
}

const navCounts = {
  'Admin/Director (OrganizationDirectorDashboard.tsx DIRECTOR_NAV_ITEMS)': countNavKeys('src/pages/enterprise/OrganizationDirectorDashboard.tsx', 'DIRECTOR_NAV_ITEMS'),
  'Caregiver (EnterpriseCaregiverDashboard.tsx NAV_ITEMS)': countNavKeys('src/pages/enterprise/EnterpriseCaregiverDashboard.tsx', 'NAV_ITEMS'),
  'Medical (ClinicalOfficeDashboard.tsx MEDICAL_NAV_ITEMS)': countNavKeys('src/pages/enterprise/ClinicalOfficeDashboard.tsx', 'MEDICAL_NAV_ITEMS'),
  'Therapy (ClinicalOfficeDashboard.tsx THERAPY_NAV_ITEMS)': countNavKeys('src/pages/enterprise/ClinicalOfficeDashboard.tsx', 'THERAPY_NAV_ITEMS'),
  'Patient (EnterprisePatientDashboard.tsx NAV_ITEMS)': countNavKeys('src/pages/patient/EnterprisePatientDashboard.tsx', 'NAV_ITEMS'),
};
let totalNav = 0;
for (const [office, count] of Object.entries(navCounts)) {
  oks.push(`Navigation — ${office}: ${count} destinations`);
  totalNav += count;
}
// The approved Owner/Director authority separation introduced an additional
// Organization Ownership tab in the Director's 14-item array. It is NOT part
// of the original 60-destination (13+14+12+11+10) acceptance baseline.
// Count that supplemental destination independently; do not remove the
// ownership screen, inflate the original acceptance coverage, or ignore
// an unrelated new item in the future.
const directorSource = fs.readFileSync(path.join(ROOT, 'src/pages/enterprise/OrganizationDirectorDashboard.tsx'), 'utf8');
const directorNavStart = directorSource.indexOf('const DIRECTOR_NAV_ITEMS');
const directorNavEnd = directorSource.indexOf('const DIRECTOR_NAV_GROUPS', directorNavStart);
const directorNavBody = directorSource.slice(directorNavStart, directorNavEnd);
const ownerNavMatches = [...directorNavBody.matchAll(/key:\s*'ownership'/g)].length;
check('Supplemental Director Organization Ownership navigation entry', ownerNavMatches, 1);
check('Original 60 core navigation destinations (excluding supplemental ownership)', totalNav - ownerNavMatches, 60);
check('Current 5-office navigation entries including ownership', totalNav, 61);

// ---------------------------------------------------------------------
// 4. 25 ordered office-pair communication combinations — the 5x5 grid
//    table in the cross-office matrix test file's own header comment
//    (the authoritative, currently-tested grid).
// ---------------------------------------------------------------------
const matrixTestPath = path.join(ROOT, 'tests', 'integration', 'crossOfficeCommunicationMatrix.test.ts');
const matrixText = fs.readFileSync(matrixTestPath, 'utf8');
const officesMatch = matrixText.match(/type ReachableOffice = ([^;]+);/);
if (!officesMatch) throw new Error('Could not find ReachableOffice union in crossOfficeCommunicationMatrix.test.ts');
const officeCount = officesMatch[1].split('|').length;
check('25-cell communication matrix: office count forms a 5x5 grid', officeCount * officeCount, 25);

// ---------------------------------------------------------------------
// 5. 15 current acceptance documents.
// ---------------------------------------------------------------------
const finalDocsDir = path.join(ROOT, 'docs', 'acceptance', 'final');
const finalDocs = fs.readdirSync(finalDocsDir).filter((f) => f.endsWith('.md'));
check('15 Wave E acceptance documents present', finalDocs.length, 15);
const refreshed = finalDocs.filter((f) => fs.readFileSync(path.join(finalDocsDir, f), 'utf8').includes('## UPDATE —'));
check('15 Wave E acceptance documents carrying a dated current-state UPDATE section', refreshed.length, 15);

// ---------------------------------------------------------------------
// 6. Final commit consistency — every commit SHA this register cites
//    (its own checkpoint history, every finding's evidence column,
//    etc.) must actually exist in this repository's git history. A
//    typo'd or copy-pasted-wrong SHA would otherwise silently point a
//    future reader at the wrong diff.
// ---------------------------------------------------------------------
const citedShas = new Set([...registerText.matchAll(/`([0-9a-f]{7,10})`/g)].map((m) => m[1]));
const unknownShas = [];
for (const sha of citedShas) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: ROOT, stdio: 'ignore' });
  } catch {
    unknownShas.push(sha);
  }
}
check('Commit-SHA consistency: every SHA cited in the register exists in git history', unknownShas.length, 0);
if (unknownShas.length) failures.push(`  -> unresolvable SHA(s): ${unknownShas.join(', ')}`);
if (unknownShas.length === 0) oks.push(`Commit-SHA consistency: ${citedShas.size} distinct SHAs cited, all resolved`);

// ---------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------
console.log('=== PASS ===');
for (const line of oks) console.log('  ' + line);
if (failures.length) {
  console.log('\n=== FAIL ===');
  for (const line of failures) console.log('  ' + line);
  console.log(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${oks.length} checks passed.`);
