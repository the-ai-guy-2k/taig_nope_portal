document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar && window.matchMedia('(max-width: 720px)').matches) {
    sidebar.setAttribute('aria-label', 'Main navigation (compact)');
  }
});
