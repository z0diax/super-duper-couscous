import React from 'react';
import { FileText, FolderOpen } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

interface StartupLoaderProps {
  message: string;
}

const documentOffsets = [-26, 0, 26];

export const StartupLoader: React.FC<StartupLoaderProps> = ({ message }) => {
  const reduceMotion = useReducedMotion();

  return (
    <main
      className="min-h-screen bg-slate-100 flex items-center justify-center p-6"
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <section className="w-full max-w-md text-center">
        <div className="relative mx-auto h-44 w-52" aria-hidden="true">
          <motion.div
            className="absolute left-1/2 top-7 h-28 w-28 -translate-x-1/2 rounded-full border border-blue-200 bg-blue-50"
            animate={reduceMotion ? undefined : { scale: [1, 1.06, 1], opacity: [0.65, 1, 0.65] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />

          {documentOffsets.map((offset, index) => (
            <motion.div
              key={offset}
              className="absolute left-1/2 top-1 z-20 flex h-14 w-11 items-center justify-center rounded-md border border-slate-200 bg-white text-blue-600 shadow-sm"
              style={{ marginLeft: -22 }}
              initial={false}
              animate={
                reduceMotion
                  ? { x: offset * 0.45, y: 38, rotate: 0, opacity: 1 }
                  : {
                      x: [offset, offset, offset * 0.45, offset * 0.45],
                      y: [-18, -18, 54, 54],
                      rotate: [offset / 7, offset / 7, 0, 0],
                      opacity: [0, 1, 1, 0],
                    }
              }
              transition={{
                duration: 2.4,
                repeat: Infinity,
                delay: index * 0.16,
                times: [0, 0.16, 0.68, 1],
                ease: 'easeInOut',
              }}
            >
              <FileText size={24} strokeWidth={1.8} />
            </motion.div>
          ))}

          <motion.div
            className="absolute left-1/2 top-[4.4rem] z-30 -translate-x-1/2 text-blue-600"
            animate={reduceMotion ? undefined : { y: [0, -3, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <FolderOpen size={88} strokeWidth={1.45} fill="var(--app-primary-soft)" />
          </motion.div>

          <div className="absolute bottom-3 left-1/2 h-1.5 w-36 -translate-x-1/2 overflow-hidden rounded-full bg-slate-200">
            <motion.div
              className="h-full rounded-full bg-blue-600"
              animate={reduceMotion ? { width: '65%' } : { x: ['-100%', '250%'] }}
              transition={{ duration: 1.35, repeat: Infinity, ease: 'easeInOut' }}
              style={{ width: '42%' }}
            />
          </div>
        </div>

        <h1 className="mt-1 text-xl font-semibold text-slate-900">HRMDO</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">Records Management System</p>
        <p className="mt-5 text-sm text-slate-600">{message}</p>
      </section>
    </main>
  );
};
