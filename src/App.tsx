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
        return [...prev, ...valid.filter((v) => !existing.has(v.filename))];
      });
      if (newErrors.length) setErrors((prev) => [...prev, ...newErrors]);
    });
  }, []);

  function removePortfolio(id: string) {
    setPortfolios((prev) => prev.filter((p) => p.id !== id));
  }

  const comparisons = portfolios.length > 0 ? buildComparisons(portfolios) : [];
  const summaries = portfolios.length > 0 ? buildSummaries(portfolios) : [];

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Portfolio Price Comparison</h1>
        <p className="app-subtitle">Import Collectr CSV exports to track and compare card prices over time</p>
      </header>

      <main className="app-main">
        <FileDropZone onFiles={handleFiles} />

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
