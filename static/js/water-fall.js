function initWaterFall(container, child) {
  const Journal = document.querySelector(container);
  const allArticles = document.querySelectorAll(child);
  if (!allArticles[0]) return;

  programming()

  window.addEventListener('resize', () => programming())

  function programming() {
    Journal.style.display = 'block'
    Journal.style.opacity = '0'
    allArticles.forEach(val => val.style.gridRow = `span ${Math.ceil(val.offsetHeight)}`)
    Journal.style.display = 'grid'
    Journal.style.opacity = '1'
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const images = document.querySelectorAll('.FrontPage > img');

  async function imageLoaded(img) {
    return new Promise((resolve, reject) => {
      if (img.complete && img.naturalHeight !== 0) {
        resolve();
      } else {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', reject, { once: true });
      }
    });
  }

  await Promise.all(Array.from(images).map(img => imageLoaded(img)));

  initWaterFall('.Journal > div', '.Journal > div > article,.FrontPage ')
});
