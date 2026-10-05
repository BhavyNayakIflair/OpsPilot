import { describe, expect, it } from 'vitest';
import { supportedLocales, translate } from '../i18n';

describe('interface translations', () => {
  it('provides the supported locales and an English default', () => {
    expect(supportedLocales).toEqual(['en', 'fr', 'de', 'es', 'it']);
    expect(translate('en', 'workspaceSettings')).toBe('Workspace settings');
  });

  it('translates shared settings labels and interpolates values', () => {
    expect(translate('fr', 'workspaceSettings')).toBe('Paramètres de l’espace de travail');
    expect(translate('de', 'teamMembers', { count: 3 })).toBe('Teammitglieder (3)');
    expect(translate('es', 'removeMemberConfirm', { name: 'Ada' })).toContain('Ada');
    expect(translate('it', 'language')).toBe('Lingua');
  });
});
