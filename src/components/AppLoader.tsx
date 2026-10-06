import React, { useState } from 'react';
import './AppLoader.css';
import { LoaderThemeDecoration } from '../theme/LoaderThemeDecoration';
import { useTheme } from '../theme/ThemeProvider';
import { resolveLoaderContentPool, selectLoaderContent } from '../theme/themeLoaderContent';

type AppLoaderProps = {
  message: string;
  exiting?: boolean;
  initialStartup?: boolean;
};

// Mounted only for the initial startup. Status/theme rerenders never reselect.
const StartupContent: React.FC = () => {
  const { systemTheme, effectiveWeatherTheme } = useTheme();
  const [content] = useState(() => selectLoaderContent(resolveLoaderContentPool(systemTheme, effectiveWeatherTheme)));
  return (
    <p className="app-loader-content" data-content-type={content.type}>
      <span className="app-loader-content-accent" aria-hidden="true">✦</span>{' '}
      {content.type === 'trivia' && <span className="app-loader-content-label">Trivia: </span>}
      <span className="app-loader-content-text">{content.text}</span>
    </p>
  );
};

export const AppLoader: React.FC<AppLoaderProps> = ({ message, exiting = false, initialStartup = false }) => (
  <main className={`app-loader-screen${exiting ? ' app-loader-exiting' : ''}`}>
    <LoaderThemeDecoration />
    <section className="app-loader">
      <div role="status" aria-live="polite" aria-label={message}>
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
      </div>
      {initialStartup && <StartupContent />}
    </section>
  </main>
);
