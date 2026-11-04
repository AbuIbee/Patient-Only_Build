import { describe, expect, it } from 'vitest';
import { AG_DROPDOWN_GROUPS, normalizeAGValues } from './enterpriseAGOptions';

describe('Enterprise patient A–G dropdowns', () => {
  it('has all seven titled categories with selectable options', () => {
    expect(AG_DROPDOWN_GROUPS.map(g=>g.code)).toEqual(['A','B','C','D','E','F','G']);
    for (const category of AG_DROPDOWN_GROUPS) {
      expect(category.title.length).toBeGreaterThan(4);
      expect(category.fields.length).toBeGreaterThanOrEqual(2);
      for(const field of category.fields) {
        expect(field.key.length).toBeGreaterThan(4);
        expect(field.options.length).toBeGreaterThanOrEqual(3);
      }
    }
  });
  it('accepts exact preexisting care partner clinical choices', () => {
    const data = normalizeAGValues({
      fn_dressing:'Needs hands-on help',nu_meal_pct:'75%',
      co_skin:'Redness',sa_falls:'Fall — injury',be_agitation:'Mild — easily redirected',
      mo_sleep:'Day-night reversal',sy_pain:'Moderate — affecting daily activity',
      sa_injury_details:'Observed while transferring.',
    });
    expect(Object.keys(data)).toHaveLength(8);
    expect(data.fn_dressing).toBe('Needs hands-on help');
    expect(data.nu_meal_pct).toBe('75%');
    expect(data.sa_injury_details).toContain('transferring');
  });
  it('rejects unauthorized fields and unsupported selections', () => {
    const data=normalizeAGValues({patient_id:'forged',submitted_by:'forged',
      fn_dressing:'Pretend value',mo_mood:'Calm',organization_id:'wrong-org'});
    expect(data).toEqual({mo_mood:'Calm'});
  });
  it('does not save fall details without a recorded fall', () => {
    expect(normalizeAGValues({sa_falls:'None',sa_injury_details:'not relevant'}))
      .toEqual({sa_falls:'None'});
  });
  it('trims and limits free-text notes', () => {
    const note='  '+ 'x'.repeat(1500) + '  ';
    expect(normalizeAGValues({fn_comments:note}).fn_comments).toHaveLength(1000);
  });
  it('does not default blank clinical assessments to normal', () => {
    expect(normalizeAGValues({})).toEqual({});
  });
});
