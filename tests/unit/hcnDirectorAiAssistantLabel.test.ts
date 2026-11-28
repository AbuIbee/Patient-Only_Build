import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Haneen Director AI Assistant header label', () => {
  const header = readFileSync(resolve(process.cwd(), 'src/pages/enterprise/OfficeHeaderTools.tsx'), 'utf8');

  it('labels the Director tool Director’s AI Assistant without renaming Caregiver Helper', () => {
    expect(header).toContain("const assistantLabel = caregiver ? 'Caregiver Helper' : 'Director’s AI Assistant';");
    expect(header).not.toContain("'Director’s Assistant'");
  });

  it('uses one accessible label for the button and dialog title', () => {
    expect(header).toContain('aria-label={assistantLabel}');
    expect(header).toContain('<DialogTitle>{assistantLabel}</DialogTitle>');
  });
});
