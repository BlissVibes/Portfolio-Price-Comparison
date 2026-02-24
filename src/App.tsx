import { useState, useCallback } from 'react';
import FileDropZone from './components/FileDropZone';
import SummaryCards from './components/SummaryCards';
import ComparisonTable from './components/ComparisonTable';
import type { PortfolioFile } from './types';
import { parseCollectrCSV } from './csvParser';
import { buildComparisons, buildSummaries } from './comparison';

export default function App() {
  const [portfolios, setPortfolios] = useState<PortfolioFile[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [ignoreDifferentNames, setIgnoreDifferentNames] = useState(false);

  const handleFiles = useCallback((files: File[]) => {
    const newErrors: string[] = [];

    Promise.all(
      files.map(
        (file) =>
          new Promise<PortfolioFile | null>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              const content = e.target?.result as string;
              const parsed = parseCollectrCSV(content, file.name);
              if (!parsed) {
                newErrors.push(`Failed to parse ${file.name}`);
                resolve(null);
              } else {
                resolve(parsed);
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

        // Check for portfolio name mismatches
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
            // Filter out mismatched portfolios
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
      <header className="app-header">
        <h1 className="app-title">Portfolio Price Comparison</h1>
        <p className="app-byline">by BlissTCG</p>
        <p className="app-subtitle">Import Collectr CSV exports to track and compare card prices over time</p>
      </header>

      <main className="app-main">
        <FileDropZone onFiles={handleFiles} />

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
            <ComparisonTable comparisons={comparisons} portfolios={portfolios} />
          </>
        )}
      </main>
    </div>
  );
}
