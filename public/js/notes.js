// public/js/notes.js

/**
 * Toggle the visibility of the notes section for a specific vehicle.
 * @param {string} vehicleId - The unique ID of the vehicle.
 */
function toggleNotes(vehicleId) {
  const notesRow = document.getElementById(`notes-${vehicleId}`);
  if (notesRow.style.display === 'table-row') {
    notesRow.style.display = 'none';
  } else {
    notesRow.style.display = 'table-row';
  }
}

/**
 * Handle adding a new note via AJAX.
 * @param {Event} event - The form submission event.
 * @param {string} vehicleId - The unique ID of the vehicle.
 */
async function addNote(event, vehicleId) {
  event.preventDefault(); // Prevent the default form submission

  const form = event.target;
  const date = form.date.value;
  const note = form.note.value.trim();

  if (!date || !note) {
    alert('Please provide both date and note.');
    return;
  }

  try {
    const response = await fetch(`/notes/${vehicleId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ date, note }),
    });

    const result = await response.json();

    if (response.ok) {
      alert('Note added successfully.');
      // Reload notes section to display the new note
      await loadNotes(vehicleId);
      // Reset the form
      form.reset();
    } else {
      alert(`Error: ${result.error}`);
    }
  } catch (err) {
    console.error('Error adding note:', err);
    alert('An error occurred while adding the note.');
  }
}

/**
 * Fetch and display notes for a specific vehicle.
 * @param {string} vehicleId - The unique ID of the vehicle.
 */
async function loadNotes(vehicleId) {
  try {
    const response = await fetch(`/notes/${vehicleId}`);
    const notes = await response.json();

    const notesContainer = document.querySelector(`#notes-${vehicleId} .notes-section`);
    let notesHTML = '<h3>Service Notes</h3>';

    if (notes.length > 0) {
      notes.forEach(note => {
        notesHTML += `<div class="note-item"><strong>${note.date}</strong>: ${note.note}</div>`;
      });
    } else {
      notesHTML += '<p>No service notes available.</p>';
    }

    notesHTML += `
      <!-- Add Note Form -->
      <form class="add-note-form" onsubmit="addNote(event, '${vehicleId}')">
        <input type="date" name="date" required>
        <input type="text" name="note" placeholder="Enter service note" required>
        <button type="submit">Add Note</button>
      </form>
    `;

    notesContainer.innerHTML = notesHTML;
  } catch (err) {
    console.error('Error loading notes:', err);
    alert('An error occurred while loading the notes.');
  }
}
