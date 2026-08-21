import {
  classificarObjeto,
  ehMerito,
  OBJETOS_DE_MERITO,
} from './objeto-votacao';

describe('classificarObjeto', () => {
  /**
   * As descrições vêm do sistema da Câmara, não de digitação livre — por isso
   * a classificação por lista explícita funciona. Casos colhidos da produção.
   */
  const CASOS: [string, string][] = [
    ['Aprovado o parecer.', 'PARECER'],
    ['Aprovado o parecer do relator, Dep. Fulano.', 'PARECER'],
    ['Aprovado o relatório com complementação de voto.', 'PARECER'],
    ['Aprovado o requerimento.', 'REQUERIMENTO'],
    ['Aprovado, por unanimidade, o Requerimento de Urgência (Art. 155).', 'REQUERIMENTO'],
    ['Rejeitado o requerimento de retirada de pauta.', 'REQUERIMENTO'],
    ['Aprovada a preferência.', 'REQUERIMENTO'],
    ['Aprovada a Redação Final.', 'REDACAO_FINAL'],
    ['Aprovada a Redação Final assinada pelo relator, Dep. Fulano.', 'REDACAO_FINAL'],
    ['Realizar o encaminhamento do PL-1800/2023 à CFT.', 'ENCAMINHAMENTO'],
    ['Alteração do regime de tramitação.', 'ENCAMINHAMENTO'],
    ['Aprovado o Projeto de Lei nº 3.083, de 2026.', 'TEXTO_BASE'],
    ['Aprovado o Substitutivo ao Projeto de Lei nº 5.415.', 'TEXTO_BASE'],
    ['Aprovada a Medida Provisória nº 1.234, de 2025.', 'TEXTO_BASE'],
    ['Mantido o texto.', 'TEXTO_BASE'],
    ['Aprovada a Subemenda da Comissão de Constituição e Justiça.', 'EMENDA'],
    ['Rejeitado o Destaque para votação em separado.', 'DESTAQUE'],
  ];

  it.each(CASOS)('should classify %s as %s', (resumo, esperado) => {
    expect(classificarObjeto(resumo)).toBe(esperado);
  });

  describe('armadilhas da comparação por substring', () => {
    /**
     * "Proposta de Emenda à Constituição" contém "emenda", mas uma PEC é texto
     * base. A ordem das regras é o que resolve — a entrada específica precede
     * a de EMENDA.
     */
    it('should not read a PEC as an amendment vote', () => {
      expect(
        classificarObjeto('Aprovada a Proposta de Emenda à Constituição nº 45, de 2019.'),
      ).toBe('TEXTO_BASE');
    });

    /**
     * "Emendas ao Substitutivo" contém "substitutivo", mas o objeto votado são
     * as emendas.
     */
    it('should read the object, not the document it attaches to', () => {
      expect(classificarObjeto('Rejeitadas as Emendas ao Substitutivo.')).toBe(
        'EMENDA',
      );
    });

    /** "Redação Final assinada pelo relator" contém "relator", mas não é parecer. */
    it('should not read a final wording vote as an opinion vote', () => {
      expect(
        classificarObjeto('Aprovada a Redação Final assinada pelo relator.'),
      ).toBe('REDACAO_FINAL');
    });
  });

  describe('falha segura', () => {
    /** Sem objeto identificável, nunca chuta. */
    it.each([['Aprovado.'], ['Aprovado'], [''], [null], [undefined]])(
      'should return INDEFINIDO for %p',
      (resumo) => {
        expect(classificarObjeto(resumo as string | null)).toBe('INDEFINIDO');
      },
    );
  });

  describe('acentuação', () => {
    it('should classify the same with or without accents', () => {
      expect(classificarObjeto('Aprovada a Redação Final.')).toBe(
        classificarObjeto('Aprovada a Redacao Final.'),
      );
      expect(classificarObjeto('Aprovada a Medida Provisória nº 1.')).toBe(
        'TEXTO_BASE',
      );
    });
  });
});

describe('ehMerito', () => {
  /**
   * Requerimento é rito, redação final é formalidade quase unânime e
   * encaminhamento é despacho administrativo: nenhum diz o que o parlamentar
   * pensa da matéria.
   */
  it('should treat only merit objects as merit', () => {
    expect(OBJETOS_DE_MERITO).toEqual([
      'TEXTO_BASE',
      'PARECER',
      'EMENDA',
      'DESTAQUE',
    ]);

    expect(ehMerito('TEXTO_BASE')).toBe(true);
    expect(ehMerito('PARECER')).toBe(true);
    expect(ehMerito('REQUERIMENTO')).toBe(false);
    expect(ehMerito('REDACAO_FINAL')).toBe(false);
    expect(ehMerito('ENCAMINHAMENTO')).toBe(false);
    expect(ehMerito('INDEFINIDO')).toBe(false);
  });
});
