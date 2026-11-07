async function check() {
  const res = await fetch("https://digital-twin-suite.onrender.com/api/atlas/integrations/client-health");
  console.log("Status:", res.status);
  const data = await res.json();
  console.log("Client health from Render:", JSON.stringify(data, null, 2));
}

check().catch(console.error);
