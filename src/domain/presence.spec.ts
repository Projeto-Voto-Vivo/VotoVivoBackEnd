import {
  acumular,
  baldeVazio,
  classificarEscopo,
  classificarNatureza,
  dentroDoExercicio,
  normalizar,
  resumirBalde,
} from './presence';

describe('normalizar', () => {
  it('should strip accents, case and extra spaces', () => {
    expect(normalizar('  Sessão   NÃO Deliberativa  ')).toBe(
      'sessao nao deliberativa',
    );
  });

  it('should treat null and undefined as empty', () => {
    expect(normalizar(null)).toBe('');
    expect(normalizar(undefined)).toBe('');
  });
});

describe('classificarNatureza', () => {
  it('should classify the canonical deliberative sessions', () => {
    expect(classificarNatureza('Sessão Deliberativa')).toBe('DELIBERATIVA');
    expect(classificarNatureza('Sessão Conjunta')).toBe('DELIBERATIVA');
    expect(classificarNatureza('Reunião Deliberativa')).toBe('DELIBERATIVA');
  });

  /**
   * O `includes('deliberativa')` antigo classificava esta sessao como
   * deliberativa — inflando o denominador da estatistica-vitrine do produto.
   */
  it('should NOT classify a solemn non-deliberative session as deliberative', () => {
    expect(classificarNatureza('Sessão Não Deliberativa Solene')).toBe(
      'NAO_DELIBERATIVA',
    );
    expect(classificarNatureza('Sessão Não Deliberativa')).toBe('NAO_DELIBERATIVA');
  });

  /** Antes, `descricaoTipo` nulo caia em deliberativa por default. */
  it('should classify null or unknown descriptions as INDEFINIDA', () => {
    expect(classificarNatureza(null)).toBe('INDEFINIDA');
    expect(classificarNatureza('')).toBe('INDEFINIDA');
    expect(classificarNatureza('Reunião de Pauta Extraordinária Especial')).toBe(
      'INDEFINIDA',
    );
  });
});

describe('classificarEscopo', () => {
  it('should classify plenary by tipoOrgao', () => {
    expect(classificarEscopo({ tipoOrgao: 'Plenário' })).toBe('PLENARIO');
  });

  it('should classify plenary by sigla when tipoOrgao is unhelpful', () => {
    expect(classificarEscopo({ tipoOrgao: null, sigla: 'PLEN-SF' })).toBe('PLENARIO');
  });

  it('should classify committees', () => {
    expect(classificarEscopo({ tipoOrgao: 'Comissão Permanente' })).toBe('COMISSAO');
    expect(classificarEscopo({ tipoOrgao: 'Comissão Parlamentar de Inquérito' })).toBe(
      'COMISSAO',
    );
  });

  /** Evento sem orgao nunca pode cair no balde de plenario. */
  it('should classify a missing orgao as INDEFINIDO', () => {
    expect(classificarEscopo(null)).toBe('INDEFINIDO');
    expect(classificarEscopo({ tipoOrgao: null, sigla: null })).toBe('INDEFINIDO');
  });
});

describe('dentroDoExercicio', () => {
  const posseEm2025 = [{ inicio: new Date('2025-02-01T00:00:00Z'), fim: null }];

  /**
   * Aceite do plano: senador que assumiu em 2025 tem zero ausencias antes da
   * posse.
   */
  it('should exclude events before the term started', () => {
    expect(dentroDoExercicio(new Date('2023-08-22T16:00:00Z'), posseEm2025)).toBe(false);
  });

  it('should include events inside an open-ended term', () => {
    expect(dentroDoExercicio(new Date('2025-03-11T16:00:00Z'), posseEm2025)).toBe(true);
  });

  it('should include the whole last day of a closed term', () => {
    const periodos = [
      { inicio: new Date('2023-02-01T00:00:00Z'), fim: new Date('2024-03-17T00:00:00Z') },
    ];

    expect(dentroDoExercicio(new Date('2024-03-17T20:00:00Z'), periodos)).toBe(true);
    expect(dentroDoExercicio(new Date('2024-03-18T09:00:00Z'), periodos)).toBe(false);
  });

  it('should not filter when there are no known terms', () => {
    expect(dentroDoExercicio(new Date('2023-08-22T16:00:00Z'), [])).toBe(true);
  });

  it('should exclude events without a date', () => {
    expect(dentroDoExercicio(null, posseEm2025)).toBe(false);
  });
});

describe('resumirBalde', () => {
  it('should return null rates for an empty bucket, never 0%', () => {
    expect(resumirBalde(baldeVazio())).toEqual({
      taxa: null,
      taxaEstrita: null,
      total: 0,
      presentes: 0,
      justificadas: 0,
      faltas: 0,
    });
  });

  it('should count a justified absence as attendance only in the lenient rate', () => {
    const balde = baldeVazio();
    acumular(balde, 'PRESENTE');
    acumular(balde, 'JUSTIFICADA');
    acumular(balde, 'AUSENTE');
    acumular(balde, 'AUSENTE');

    const resumo = resumirBalde(balde);

    expect(resumo.taxa).toBe(50);
    expect(resumo.taxaEstrita).toBe(25);
    expect(resumo.faltas).toBe(2);
  });
});
