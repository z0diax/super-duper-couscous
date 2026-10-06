import React from 'react';
import './AppLoader.css';
import { LoaderThemeDecoration } from '../theme/LoaderThemeDecoration';

type AppLoaderProps = {
  message: string;
  exiting?: boolean;
};

export const AppLoader: React.FC<AppLoaderProps> = ({ message, exiting = false }) => (
  <main className={`app-loader-screen${exiting ? ' app-loader-exiting' : ''}`}>
    <LoaderThemeDecoration />
    <section className="app-loader" role="status" aria-live="polite" aria-label={message}>
      <div className="app-loader-scene" aria-hidden="true">
        <div className="app-loader-folder-back" />
        {[0, 1, 2].map(index => (
          <div className="app-loader-document" key={index} style={{ animationDelay: `${index}s` }}>
            <span className="app-loader-document-line" />
            <span className="app-loader-document-line" />
            <span className="app-loader-document-line" />
          </div>
        ))}
        <div className="app-loader-folder-front"><span className="app-loader-folder-mark">HR</span></div>
      </div>
      <div className="app-loader-route" aria-hidden="true"><span /></div>
      <p className="app-loader-eyebrow">HRMDO</p>
      <h1 className="app-loader-title">Records Management System</h1>
      <p className="app-loader-message">{message}</p>
    </section>
  </main>
);
