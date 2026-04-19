const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
setTimeout(() => {
  const loader = document.getElementById('app-loader');
  if (loader) {
    loader.classList.add('hidden');
    setTimeout(() => loader.remove(), 400);
  }
}, 300);
