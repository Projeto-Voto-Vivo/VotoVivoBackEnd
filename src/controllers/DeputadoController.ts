import { Request, Response } from 'express';
import { DeputadoService } from '../services/DeputadoService';
import { DespesaService } from '../services/DespesaService';

export class DeputadoController {
  private deputadoService = new DeputadoService();
  private despesaService = new DespesaService();

  listar = async (req: Request, res: Response) => {
    try {
      const { nome, partido, uf, pagina } = req.query;
      const resultado = await this.deputadoService.listar({
        nome: nome ? String(nome) : undefined,
        partido: partido ? String(partido) : undefined,
        uf: uf ? String(uf) : undefined,
        pagina: pagina ? Number(pagina) : 1
      });
      res.json(resultado);
    } catch (error) {
      console.error('Erro em listar deputados:', error);
      res.status(500).json({ error: 'Erro interno' });
    }
  };

  buscar = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ error: 'ID inválido' });
            return; 
        }

        const deputado = await this.deputadoService.buscarPorId(id);
        if (!deputado) {
            res.status(404).json({ error: 'Não encontrado' });
            return;
        }

        res.json(deputado);
    } catch (error) {
        console.error(`Erro ao buscar deputado ${req.params.id}:`, error);
        res.status(500).json({ error: 'Erro interno' });
    }
  };

  listarDespesas = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ error: 'ID inválido' });
            return;
        }

        const { ano, mes, pagina } = req.query;
        const resultado = await this.despesaService.listarPorDeputado(id, {
            ano: ano ? Number(ano) : undefined,
            mes: mes ? Number(mes) : undefined,
            pagina: pagina ? Number(pagina) : 1
        });
        res.json(resultado.data);
    } catch (error) {
        console.error(`Erro ao listar despesas do deputado ${req.params.id}:`, error);
        res.status(500).json({ error: 'Erro interno' });
    }
  };

  resumoDespesas = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ error: 'ID inválido' });
            return;
        }

        const resumo = await this.despesaService.resumoGastos(id);
        res.json(resumo);
    } catch (error) {
        console.error(`Erro ao gerar resumo do deputado ${req.params.id}:`, error);
        res.status(500).json({ error: 'Erro interno' });
    }
  };
}
