import axios from 'axios';
import { AgentMetrics } from '../types/metrics';

const API_BASE = 'http://localhost:8000/api/v1';

export const api = {
  // Получение последних метрик всех агентов
  async getAgentMetrics(): Promise<Record<string, AgentMetrics>> {
    try {
      const response = await axios.get(`${API_BASE}/metrics/latest`);
      
      // Проверяем, есть ли сообщение об отсутствии метрик
      if (response.data && response.data.message === 'No metrics available') {
        return {};
      }
      
      // Если данные - это объект с метриками агентов
      if (response.data && typeof response.data === 'object' && !Array.isArray(response.data)) {
        return response.data as Record<string, AgentMetrics>;
      }
      
      return {};
    } catch (error) {
      console.error('Error fetching agent metrics:', error);
      return {};
    }
  },

  // Получение истории метрик агента
  async getAgentHistory(agentId: string, limit: number = 50): Promise<AgentMetrics[]> {
    try {
      const response = await axios.get(`${API_BASE}/metrics/history`, {
        params: { agent_id: agentId, limit }
      });
      return response.data || [];
    } catch (error) {
      console.error('Error fetching agent history:', error);
      return [];
    }
  },

  // WebSocket подключение для реального времени
  connectAgentWebSocket(onUpdate: (agentId: string, metrics: AgentMetrics) => void) {
    const ws = new WebSocket('ws://localhost:8000/ws/metrics');
    
    ws.onopen = () => {
      console.log('WebSocket connected');
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'metrics_update' && data.data) {
          // Обновляем метрики для каждого агента
          Object.entries(data.data).forEach(([agentId, metrics]) => {
            onUpdate(agentId, metrics as AgentMetrics);
          });
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    return ws;
  }
};