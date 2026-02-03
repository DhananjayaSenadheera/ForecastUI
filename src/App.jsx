import { useState } from 'react';
import { createCrop } from './api';

const defaultForm = {
  cropName: '',
};

export default function App() {
  const [form, setForm] = useState(defaultForm);
  const [status, setStatus] = useState({ type: 'idle', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus({ type: 'idle', message: '' });

    const payload = {
      name: form.cropName,
    };

    try {
      await createCrop(payload);
      setStatus({ type: 'success', message: 'Crop entry created successfully.' });
      setForm(defaultForm);
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Something went wrong.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="layout">
      <nav className="top-nav">
        <div className="brand">
          <span className="logo-dot" />
          Agri Forecast
        </div>
        <div className="top-actions">
          <span className="pill">Phase 1</span>
          <button type="button" className="ghost">
            Support
          </button>
        </div>
      </nav>

      <div className="shell">
        <aside className="side-nav" aria-label="Primary">
          <div className="side-icon">🏠</div>
          <div className="side-icon active">🌾</div>
          <div className="side-icon">📈</div>
          <div className="side-icon">⚙️</div>
        </aside>

        <div className="app">
          <header className="hero">
            <div>
              <p className="eyebrow">Agri Forecast Platform</p>
              <h1>Crop Registration</h1>
              <p className="subtitle">
                Phase 1: create crop profiles that power your Agri_Forecast
                analytics.
              </p>
            </div>
            <div className="hero-card">
              <h2>Service Endpoint</h2>
              <p>
                This form posts <span>createDto</span> (with the crop name) to
                <span> VITE_API_BASE_URL</span> + <span> /api/crops</span>.
                Update your environment variables to match the Agri_Forecast
                controller endpoints.
              </p>
            </div>
          </header>

          <main className="content">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Create a crop record</h2>
                  <p>Capture the crop name required by the Crop_CreateDto.</p>
                </div>
                <div className="badge">Phase 1</div>
              </div>

              <form className="form" onSubmit={handleSubmit}>
                <div className="grid">
                  <label>
                    Crop name
                    <input
                      name="cropName"
                      value={form.cropName}
                      onChange={handleChange}
                      placeholder="Maize"
                      required
                    />
                  </label>
                </div>

                {status.message ? (
                  <div className={`status ${status.type}`}>{status.message}</div>
                ) : null}

                <div className="actions">
                  <button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Submitting…' : 'Create crop'}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setForm(defaultForm)}
                  >
                    Reset form
                  </button>
                </div>
              </form>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
