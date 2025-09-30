// langsung hardcode data biar ga blank pas buka file://
const prompts = [
    {
      "title": "Rain-soaked Confession",
      "ship": "Riku/Yushi",
      "genre": "Angst",
      "character": ["Riku", "Yushi"],
      "prompter": "anon",
      "prompt": "Riku finds Yushi crying under the rain but can’t hold back his own feelings anymore.",
      "rating": "Mature"
    },
    {
      "title": "Library Accident",
      "ship": "Riku/Sion",
      "genre": "Fluff",
      "character": ["Riku", "Sion"],
      "prompter": "ao3user123",
      "prompt": "Sion drops his notes in the library, Riku helps him pick them up.",
      "rating": "General"
    },
    {
      "title": "Study Rivalry",
      "ship": "Sion/Jaehee",
      "genre": "Crack",
      "character": ["Sion", "Jaehee"],
      "prompter": "guest",
      "prompt": "Jaehee and Sion compete in a ridiculous way to impress Riku.",
      "rating": "Teen"
    }
  ];
  
  function initPromptBank() {
    const grid = document.getElementById("promptGrid");
    const searchBar = document.getElementById("searchBar");
    const shipFilter = document.getElementById("shipFilter");
    const genreFilter = document.getElementById("genreFilter");
    const characterFilter = document.getElementById("characterFilter");
  
    function render(filtered) {
      grid.innerHTML = "";
      if (filtered.length === 0) {
        grid.innerHTML = "<p>No prompts found ✨</p>";
        return;
      }
  
      filtered.forEach(p => {
        const card = document.createElement("div");
        card.className = "prompt-card";
        card.innerHTML = `
          <h3>${p.title}</h3>
          <div class="prompt-meta"><strong>Ship:</strong> ${p.ship}</div>
          <div class="prompt-meta"><strong>Genre:</strong> ${p.genre}</div>
          <div class="prompt-meta"><strong>Characters:</strong> ${p.character.join(", ")}</div>
          <div class="prompt-meta"><strong>Rating:</strong> ${p.rating}</div>
          <div class="prompt-text">${p.prompt}</div>
          <div class="prompt-meta"><em>Prompter: ${p.prompter}</em></div>
        `;
        grid.appendChild(card);
      });
    }
  
    function filterPrompts(customFilter = null) {
      let filtered = prompts.filter(p =>
        (shipFilter.value === "" || p.ship === shipFilter.value) &&
        (genreFilter.value === "" || p.genre === genreFilter.value) &&
        (characterFilter.value === "" || p.character.includes(characterFilter.value)) &&
        (searchBar.value === "" || p.prompt.toLowerCase().includes(searchBar.value.toLowerCase()))
      );
  
      if (customFilter) {
        if (customFilter === "NCTWISH") {
          filtered = prompts.filter(p =>
            p.character.includes("Riku") ||
            p.character.includes("Yushi") ||
            p.character.includes("Sion") ||
            p.character.includes("Jaehee")
          );
        } else {
          filtered = prompts.filter(p => p.character.includes(customFilter));
        }
      }
  
      render(filtered);
    }
  
    searchBar.addEventListener("input", () => filterPrompts());
    shipFilter.addEventListener("change", () => filterPrompts());
    genreFilter.addEventListener("change", () => filterPrompts());
    characterFilter.addEventListener("change", () => filterPrompts());
  
    document.querySelectorAll(".clickable").forEach(symbol => {
      symbol.addEventListener("click", () => {
        const filterValue = symbol.getAttribute("data-filter");
        filterPrompts(filterValue);
      });
    });
  
    render(prompts);
  }
  
  initPromptBank();
  