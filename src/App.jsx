import { useState } from 'react';
import { createCrop } from './api';

const defaultForm = {
  cropName: '',
  variety: '',
  plantingDate: '',
  expectedHarvestDate: '',
  areaHectares: '',
  location: '',
  notes: '',
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
      variety: form.variety,
      plantingDate: form.plantingDate,
      expectedHarvestDate: form.expectedHarvestDate,
      areaHectares: Number(form.areaHectares || 0),
      location: form.location,
      notes: form.notes,
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
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Agri Forecast Platform</p>
          <h1>Crop Registration</h1>
          <p className="subtitle">
            Phase 1: create crop profiles that power your Agri_Forecast analytics.
          </p>
        </div>
        <div className="hero-card">
          <h2>Service Endpoint</h2>
          <p>
            This form posts to <span>VITE_API_BASE_URL</span> +
            <span> /api/crops</span>. Update your environment variables to match
            the Agri_Forecast controller endpoints.
          </p>
        </div>
      </header>

      <main className="content">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Create a crop record</h2>
              <p>Capture the details needed for growth and yield forecasting.</p>
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
              <label>
                Variety
                <input
                  name="variety"
                  value={form.variety}
                  onChange={handleChange}
                  placeholder="Hybrid 505"
                  required
                />
              </label>
              <label>
                Planting date
                <input
                  type="date"
                  name="plantingDate"
                  value={form.plantingDate}
                  onChange={handleChange}
                  required
                />
              </label>
              <label>
                Expected harvest date
                <input
                  type="date"
                  name="expectedHarvestDate"
                  value={form.expectedHarvestDate}
                  onChange={handleChange}
                  required
                />
              </label>
              <label>
                Area (hectares)
                <input
                  type="number"
                  name="areaHectares"
                  value={form.areaHectares}
                  onChange={handleChange}
                  min="0"
                  step="0.1"
                  placeholder="12.5"
                  required
                />
              </label>
              <label>
                Location
                <input
                  name="location"
                  value={form.location}
                  onChange={handleChange}
                  placeholder="Northern farm plots"
                  required
                />
              </label>
            </div>

            <label className="full">
              Notes
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                placeholder="Soil moisture, irrigation plans, or other notes."
                rows="4"
              />
            </label>

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
  );
}
