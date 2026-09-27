import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Toast } from '../components/Toast';

type ToastFn = (msg: string, isError?: boolean) => void;
const ToastContext = createContext<ToastFn>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ msg: string; isError: boolean; show: boolean }>({ msg: '', isError: false, show: false });
  const timer = useRef<number | undefined>(undefined);
  const toast = useCallback<ToastFn>((msg, isError = false) => {
    setState({ msg, isError, show: true });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState((s) => ({ ...s, show: false })), 3800);
  }, []);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <Toast msg={state.msg} isError={state.isError} show={state.show} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  return useContext(ToastContext);
}
