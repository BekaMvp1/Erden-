/**
 * Перехват ошибок React — показывает сообщение вместо пустого экрана
 */
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#003161]">
          <div className="max-w-md p-6 rounded-xl bg-white/10 border border-white/30 text-white">
            <h1 className="text-xl font-bold mb-2">Ошибка приложения</h1>
            <p className="text-sm text-white/90 mb-4">{this.state.error?.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30"
            >
              Обновить страницу
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
