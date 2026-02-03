const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5282';

export async function createCrop(payload) {
  const response = await fetch(`${baseUrl}/api/crops/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ createDto: payload }),
  });

  console.log('Response status:', response);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Unable to create crop record.');
  }

  return response.json();
}
