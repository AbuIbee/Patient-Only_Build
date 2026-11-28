import type { OrgVisit } from './organizationDirectorOpsService';
import type { RequiredCareSlot, HandoffReceipt } from './hcnDirectorSafetyService';

/** A single visit may have several reasons, but appears only once in headline counts. */
export type VisitException = { visit: OrgVisit; reasons: string[]; level: 'urgent' | 'warning' };
export type CoverageRisk = { visit: OrgVisit; reason: string };
export type StaffIdentity = { userId: string; orgRole: string; status: string; firstName: string; lastName: string };
export type PatientAssignment = { user_id: string; patient_id: string; org_role: string; is_active: boolean };
export type Credential = { id: string; user_id: string; credential_name: string; expires_at: string | null; status: string };
export type PrevisitAck = { visit_id: string; caregiver_id: string; acknowledged_at: string };
export type ReadinessFinding = { key: string; detail: string; level: 'urgent' | 'warning' };

export function dayKey(isoOrMs: string | number, timeZone: string): string {
  const p = new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone,
  }).formatToParts(new Date(isoOrMs));
  const value = (type: string) => p.find(part => part.type === type)?.value ?? '';
  return value('year') + '-' + value('month') + '-' + value('day');
}

export function getVisitExceptions(
  visits: readonly OrgVisit[], timeZone: string, now: number,
): VisitException[] {
  const today = dayKey(now, timeZone);
  return visits.flatMap(visit => {
    const reasons: string[] = [];
    const start = visit.scheduledStart ? Date.parse(visit.scheduledStart) : NaN;
    const end = visit.scheduledEnd ? Date.parse(visit.scheduledEnd) : NaN;
    const onToday = Number.isFinite(start) && dayKey(visit.scheduledStart!, timeZone) === today;
    if (visit.status === 'missed' && onToday) reasons.push('Missed visit');
    if (visit.status === 'scheduled' && onToday && !visit.actualStart && now > start + 15 * 60_000) {
      reasons.push('Check-in more than 15 minutes late');
    }
    if (visit.status === 'in_progress' && !visit.actualEnd && Number.isFinite(end) &&
        now > end + 30 * 60_000) {
      reasons.push('Checkout more than 30 minutes overdue');
    }
    if (reasons.length === 0) return [];
    return [{ visit, reasons, level: reasons.includes('Missed visit') ? 'urgent' as const : 'warning' as const }];
  });
}

/**
 * Only counts scheduled visits with PROVEN invalid staffing coverage.
 * Unscheduled care requirements need a separate demand source; never infer them here.
 */
export function getCoverageRisks(
  visits: readonly OrgVisit[], staff: readonly StaffIdentity[],
  assignments: readonly PatientAssignment[], now: number,
): CoverageRisk[] {
  const roster = new Map(staff.map(person => [person.userId, person]));
  const allowed = new Set(assignments.filter(a => a.is_active && a.org_role === 'caregiver')
    .map(a => a.user_id + ':' + a.patient_id));
  return visits.flatMap(visit => {
    const start = visit.scheduledStart ? Date.parse(visit.scheduledStart) : NaN;
    if (visit.status !== 'scheduled' || !Number.isFinite(start) ||
        start < now || start > now + 48 * 60 * 60_000) return [];
    const person = roster.get(visit.caregiverId);
    const reason = !person || person.status !== 'active'
      ? 'Assigned caregiver is not an active staff member'
      : !allowed.has(visit.caregiverId + ':' + visit.patientId)
        ? 'No active caregiver-to-patient assignment' : null;
    return reason ? [{ visit, reason }] : [];
  });
}

export function getMissingVisitNotes(visits: readonly OrgVisit[], now: number): OrgVisit[] {
  const from = now - 7 * 24 * 60 * 60_000;
  return visits.filter(v => {
    const completedAt = Date.parse(v.actualEnd ?? v.scheduledEnd ?? v.scheduledStart ?? '');
    return v.status === 'completed' && !v.visitNotes?.trim() &&
      Number.isFinite(completedAt) && completedAt >= from && completedAt <= now;
  });
}

export function getReadinessFindings(
  staff: readonly StaffIdentity[], credentials: readonly Credential[],
  visits: readonly OrgVisit[], acks: readonly PrevisitAck[], now: number,
): ReadinessFinding[] {
  const results: ReadinessFinding[] = [];
  const roster = new Map(staff.map(person => [person.userId, person]));
  for (const person of staff) {
    const display = (person.firstName + ' ' + person.lastName).trim() || 'Staff member';
    if (person.status === 'invited') {
      results.push({ key: 'invited:' + person.userId, detail: display + ': activation invitation pending', level: 'warning' });
    }
  }
  for (const credential of credentials) {
    if (!credential.expires_at) continue;
    const expiration = Date.parse(credential.expires_at);
    if (!Number.isFinite(expiration) || expiration > now + 30 * 24 * 60 * 60_000) continue;
    const person = roster.get(credential.user_id);
    if (!person || person.status !== 'active') continue;
    const display = (person.firstName + ' ' + person.lastName).trim() || 'Staff member';
    results.push({
      key: 'credential:' + credential.id,
      detail: display + ': ' + credential.credential_name + (expiration <= now ? ' expired' : ' expires within 30 days'),
      level: expiration <= now ? 'urgent' : 'warning',
    });
  }
  const acknowledged = new Set(acks.map(a => a.visit_id));
  for (const visit of visits) {
    const starts = visit.scheduledStart ? Date.parse(visit.scheduledStart) : NaN;
    if (visit.status !== 'scheduled' || !Number.isFinite(starts) ||
        starts < now || starts > now + 30 * 60_000 || acknowledged.has(visit.id)) continue;
    results.push({
      key: 'previsit:' + visit.id,
      detail: visit.caregiverName + ': pre-visit acknowledgment not recorded for ' + visit.patientName,
      level: 'warning',
    });
  }
  return results;
}


export type ScheduleConflict = {
  first: OrgVisit;
  second: OrgVisit;
  overlapStart: number;
  overlapEnd: number;
};

/**
 * Derive upcoming conflicts from all organization-scoped visits in the queried time window.
 * Intervals are half-open [start,end): adjacent visits are not overlapping.
 * The server must ALSO reject conflicting writes; this read-side detector is advisory.
 */
export function getUpcomingScheduleConflicts(
  visits: readonly OrgVisit[], now: number, horizonHours = 48,
): ScheduleConflict[] {
  const horizon = now + horizonHours * 60 * 60_000;
  const grouped = new Map<string, Array<{ visit: OrgVisit; start: number; end: number }>>();
  for (const visit of visits) {
    if (!['scheduled', 'in_progress'].includes(visit.status)) continue;
    const start = Date.parse(visit.scheduledStart ?? '');
    const end = Date.parse(visit.scheduledEnd ?? '');
    if (!visit.caregiverId || !Number.isFinite(start) || !Number.isFinite(end) ||
        start >= end || end <= now || start > horizon) continue;
    const row = { visit, start, end };
    const list = grouped.get(visit.caregiverId) ?? [];
    list.push(row);
    grouped.set(visit.caregiverId, list);
  }
  const result: ScheduleConflict[] = [];
  for (const rows of grouped.values()) {
    rows.sort((a,b) => a.start - b.start || a.visit.id.localeCompare(b.visit.id));
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length && rows[j].start < rows[i].end; j++) {
        if (rows[i].visit.id === rows[j].visit.id) continue;
        const overlapStart = Math.max(rows[i].start,rows[j].start);
        const overlapEnd = Math.min(rows[i].end,rows[j].end);
        if (overlapEnd > now && overlapStart <= horizon) {
          result.push({ first:rows[i].visit, second:rows[j].visit, overlapStart, overlapEnd });
        }
      }
    }
  }
  return result.sort((a,b) => a.overlapStart - b.overlapStart ||
    a.first.id.localeCompare(b.first.id) || a.second.id.localeCompare(b.second.id));
}


export type UnscheduledCareRequirement = {
  slot: RequiredCareSlot;
  reason: 'No valid scheduled visit covers the required time window';
};

/**
 * A requirement is only covered if ONE visit fully spans it, is active/valid and
 * has an active caregiver-to-patient assignment. A 5-minute overlap does not
 * satisfy a one-hour required-care slot.
 */
export function getUnscheduledCareRequirements(
  slots: readonly RequiredCareSlot[], visits: readonly OrgVisit[],
  staff: readonly StaffIdentity[], assignments: readonly PatientAssignment[], now: number,
): UnscheduledCareRequirement[] {
  const until = now + 48 * 60 * 60_000;
  const validStaff = new Set(staff.filter(s => s.status === 'active' && s.orgRole === 'caregiver')
    .map(s => s.userId));
  const validAssignments = new Set(assignments.filter(a => a.is_active && a.org_role === 'caregiver')
    .map(a => a.user_id + ':' + a.patient_id));
  return slots.flatMap(slot => {
    const start = Date.parse(slot.starts_at);
    const end = Date.parse(slot.ends_at);
    if (slot.status !== 'required' || !Number.isFinite(start) || !Number.isFinite(end) ||
        end <= now || start > until || end <= start) return [];
    const covered = visits.some(visit => {
      if (visit.patientId !== slot.patient_id ||
          !['scheduled', 'in_progress', 'completed'].includes(visit.status)) return false;
      const visitStart = Date.parse(visit.scheduledStart ?? '');
      const visitEnd = Date.parse(visit.scheduledEnd ?? '');
      return Number.isFinite(visitStart) && Number.isFinite(visitEnd) &&
        visitStart <= start && visitEnd >= end &&
        validStaff.has(visit.caregiverId) &&
        validAssignments.has(visit.caregiverId + ':' + visit.patientId);
    });
    return covered ? [] : [{
      slot, reason: 'No valid scheduled visit covers the required time window' as const,
    }];
  });
}

export type OverdueHandoff = { receipt: HandoffReceipt; secondsUntilDue: number };
/** Alert within 30 minutes of the receiving caregiver's first visit; remain until acknowledged. */
export function getUnacknowledgedHandoffReceipts(
  receipts: readonly HandoffReceipt[], visits: readonly OrgVisit[], now: number,
): OverdueHandoff[] {
  const activeByVisit = new Map(visits.filter(v => ['scheduled','in_progress'].includes(v.status))
    .map(v => [v.id, v]));
  return receipts.flatMap(receipt => {
    const due = Date.parse(receipt.acknowledge_by);
    if (receipt.acknowledged_at || !Number.isFinite(due) ||
        !activeByVisit.has(receipt.incoming_visit_id) ||
        due > now + 30 * 60_000 || due < now - 7 * 86400000) return [];
    return [{ receipt, secondsUntilDue: Math.round((due-now)/1000) }];
  });
}
