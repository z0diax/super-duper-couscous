import type { DocumentRecord } from '../types';

export const documentSenderLabel = (document: Pick<DocumentRecord, 'senderName' | 'sourceOffice'>) => {
  const sender = document.senderName.trim();
  const generatedSender = `${document.sourceOffice.trim()} Signatory`;
  return sender.toLocaleLowerCase() === generatedSender.toLocaleLowerCase()
    ? document.sourceOffice.trim()
    : sender;
};
