import React from 'react';
import { useToast } from './ToastProvider';
import { Toast } from '../../components/ui';
import './ToastViewport.css';

export default function ToastViewport() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-viewport" aria-label="Notifications">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          id={toast.id}
          type={toast.type}
          message={toast.message}
          onDismiss={() => dismiss(toast.id)}
        />
      ))}
    </div>
  );
}
