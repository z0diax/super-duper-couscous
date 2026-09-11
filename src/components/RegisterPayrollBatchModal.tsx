import React from 'react';
import { RegisterPayrollModal } from './RegisterPayrollModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'single' | 'batch';
}

export const RegisterPayrollBatchModal: React.FC<Props> = ({ isOpen, onClose, initialMode = 'batch' }) => {
  return <RegisterPayrollModal isOpen={isOpen} onClose={onClose} initialMode={initialMode} />;
};
