import { useState, useCallback, useEffect, useRef } from 'react';
import { version } from '../package.json';
import FileDropZone from './components/FileDropZone';
import SummaryCards from './components/SummaryCards';
import ComparisonTable from './components/ComparisonTable';
import type { PortfolioFile } from './types';
import { parsePortfolioFile } from './csvParser';
import { buildComparisons, buildSummaries } from './comparison';

const STORAGE_KEY = 'ppc_portfolios';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface AppSettings {
  darkMode: boolean;
  includeNmInEbay: boolean;
}

const SETTINGS_KEY = 'ppc_settings';
const DEFAULT_SETTINGS: AppSettings = { darkMode: true, includeNmInEbay: false };

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function loadSaved(): PortfolioFile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const { savedAt, portfolios } = JSON.parse(raw) as { savedAt: number; portfolios: PortfolioFile[] };
    if (Date.now() - savedAt > TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }
    return portfolios;
  } catch {
    return [];
  }
}

export default function App() {
  const [portfolios, setPortfolios] = useState<PortfolioFile[]>(() => loadSaved());
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [ignoreDifferentNames, setIgnoreDifferentNames] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Persist settings and apply theme
  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    document.documentElement.setAttribute('data-theme', settings.darkMode ? 'dark' : 'light');
  }, [settings]);

  // Close settings panel when clicking outside
  useEffect(() => {
    if (!showSettings) return;
    function onClickOutside(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showSettings]);

  function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    if (portfolios.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), portfolios }));
    }
  }, [portfolios]);

  const handleFiles = useCallback((files: File[]) => {
    const newErrors: string[] = [];

    Promise.all(
      files.map(
        (file) =>
          new Promise<PortfolioFile | null>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              const content = e.target?.result as string;
              const { result, error } = parsePortfolioFile(content, file.name);
              if (!result) {
                newErrors.push(error ?? `Failed to parse ${file.name}`);
                resolve(null);
              } else {
                resolve(result);
              }
            };
            reader.onerror = () => {
              newErrors.push(`Could not read ${file.name}`);
              resolve(null);
            };
            reader.readAsText(file);
          })
      )
    ).then((results) => {
      const valid = results.filter((r): r is PortfolioFile => r !== null);

      setPortfolios((prev) => {
        const existing = new Set(prev.map((p) => p.filename));
        const toAdd = valid.filter((v) => !existing.has(v.filename));

        if (!ignoreDifferentNames && prev.length > 0 && toAdd.length > 0) {
          const existingName = prev[0].portfolioName;
          const mismatched = toAdd.filter(
            (p) => p.portfolioName && existingName && p.portfolioName !== existingName
          );
          if (mismatched.length > 0) {
            setWarnings((w) => [
              ...w,
              `Portfolio name mismatch: existing files use "${existingName}" but ${mismatched.map((m) => m.filename).join(', ')} uses "${mismatched[0].portfolioName}". Enable "Ignore different portfolio names" to allow this.`,
            ]);
            const matching = toAdd.filter(
              (p) => !p.portfolioName || !existingName || p.portfolioName === existingName
            );
            return [...prev, ...matching];
          }
        }

        return [...prev, ...toAdd];
      });
      if (newErrors.length) setErrors((prev) => [...prev, ...newErrors]);
    });
  }, [ignoreDifferentNames]);

  const handleText = useCallback((content: string) => {
    const label = `Pasted Export (${new Date().toLocaleTimeString()})`;
    const { result, error } = parsePortfolioFile(content, label);
    if (!result) {
      setErrors((prev) => [...prev, error ?? 'Failed to parse pasted content']);
      return;
    }
    setPortfolios((prev) => [...prev, result]);
  }, []);

  function removePortfolio(id: string) {
    setPortfolios((prev) => prev.filter((p) => p.id !== id));
  }

  function dismissWarning(index: number) {
    setWarnings((prev) => prev.filter((_, i) => i !== index));
  }

  const comparisons = portfolios.length > 0 ? buildComparisons(portfolios) : [];
  const summaries = portfolios.length > 0 ? buildSummaries(portfolios) : [];

  return (
    <div className="app">
      {/* Settings cog — fixed top-right corner */}
      <div className="settings-wrap" ref={settingsRef}>
        <button
          className={`settings-cog${showSettings ? ' settings-cog--open' : ''}`}
          onClick={() => setShowSettings((v) => !v)}
          title="Settings"
          aria-label="Settings"
        >
          ⚙
        </button>
        {showSettings && (
          <div className="settings-panel">
            <div className="settings-panel__title">Settings</div>
            <label className="settings-item">
              <span className="settings-item__label">Dark mode</span>
              <div
                className={`settings-toggle${settings.darkMode ? ' settings-toggle--on' : ''}`}
                onClick={() => updateSetting('darkMode', !settings.darkMode)}
                role="switch"
                aria-checked={settings.darkMode}
              >
                <div className="settings-toggle__thumb" />
              </div>
            </label>
            <label className="settings-item">
              <span className="settings-item__label">Use "NM" in eBay searches for Near Mint raw cards</span>
              <div
                className={`settings-toggle${settings.includeNmInEbay ? ' settings-toggle--on' : ''}`}
                onClick={() => updateSetting('includeNmInEbay', !settings.includeNmInEbay)}
                role="switch"
                aria-checked={settings.includeNmInEbay}
              >
                <div className="settings-toggle__thumb" />
              </div>
            </label>
          </div>
        )}
      </div>

      <header className="app-header">
        <h1 className="app-title">Portfolio Price Comparison</h1>
        <p className="app-byline">by BlissTCG <span className="app-version">v{version}</span></p>
        <p className="app-subtitle">Import TCGPlayer or Collectr exports to track and compare card prices over time</p>
      </header>

      <main className="app-main">
        <FileDropZone onFiles={handleFiles} onText={handleText} />

        <label className="ignore-names-toggle">
          <input
            type="checkbox"
            checked={ignoreDifferentNames}
            onChange={(e) => {
              setIgnoreDifferentNames(e.target.checked);
              if (e.target.checked) setWarnings([]);
            }}
          />
          Ignore different portfolio names
        </label>

        {warnings.length > 0 && (
          <div className="warning-list">
            {warnings.map((w, i) => (
              <div key={i} className="warning-item">
                {w}
                <button className="warning-dismiss" onClick={() => dismissWarning(i)}>×</button>
              </div>
            ))}
          </div>
        )}

        {errors.length > 0 && (
          <div className="error-list">
            {errors.map((e, i) => (
              <div key={i} className="error-item">{e}</div>
            ))}
          </div>
        )}

        {portfolios.length > 0 && (
          <>
            <SummaryCards summaries={summaries} onRemove={removePortfolio} />
            <ComparisonTable comparisons={comparisons} portfolios={portfolios} includeNmInEbay={settings.includeNmInEbay} />
          </>
        )}
      </main>
    </div>
  );
}
