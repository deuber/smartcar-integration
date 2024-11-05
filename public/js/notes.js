// public/js/notes.js

/**
 * Toggle the visibility of the notes section for a specific vehicle.
 * @param {string} vehicleId - The unique ID of the vehicle.
 */
function toggleNotes(vehicleId) {
  const notesRow = document.getElementById(`notes-${vehicleId}`);
  if (notesRow.style.display === 'table-row' || notesRow.style.display === 'block') {
    notesRow.style.display = 'none';
  } else {
    notesRow.style.display = 'table-row'; // For table rows
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
  const dateInput = form.querySelector('input[name="date"]');
  const noteInput = form.querySelector('input[name="note"]');
  const odometerInput = form.querySelector('input[name="odometer"]');

  const date = dateInput.value;
  const note = noteInput.value.trim();
  const odometer = odometerInput.value.trim();

  // Basic Frontend Validation
  if (!date || !note || !odometer) {
    alert('Please provide date, note, and odometer reading.');
    return;
  }

  if (isNaN(odometer) || Number(odometer) < 0) {
    alert('Please enter a valid odometer reading.');
    return;
  }

  try {
    const response = await fetch(`/notes/${vehicleId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ date, note, odometer }),
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
    let notesHTML = '<h4>Service Notes</h4>';

    if (notes.length > 0) {
      notes.forEach(note => {
        notesHTML += `
          <div class="note-item">
            <strong>Date:</strong> ${note.date}<br>
            <strong>Odometer:</strong> ${note.odometer} mi<br>
            <strong>Note:</strong> ${note.note}
          </div>
        `;
      });
    } else {
      notesHTML += '<p>No service notes available.</p>';
    }

    notesHTML += `
      <!-- Add Note Form -->
      <form class="mt-3" onsubmit="addNote(event, '${vehicleId}')">
        <div class="mb-3">
          <label for="date-${vehicleId}" class="form-label">Date of Service</label>
          <input type="date" class="form-control" id="date-${vehicleId}" name="date" required>
        </div>
        <div class="mb-3">
          <label for="note-${vehicleId}" class="form-label">Service Note</label>
          <input type="text" class="form-control" id="note-${vehicleId}" name="note" placeholder="Enter service note" required>
        </div>
        <div class="mb-3">
          <label for="odometer-${vehicleId}" class="form-label">Odometer Reading</label>
          <input type="number" class="form-control" id="odometer-${vehicleId}" name="odometer" placeholder="Enter odometer reading" required min="0" step="1">
        </div>
        <button type="submit" class="btn btn-success">Add Note</button>
      </form>
    `;

    notesContainer.innerHTML = notesHTML;
  } catch (err) {
    console.error('Error loading notes:', err);
    alert('An error occurred while loading the notes.');
  }
}

/* Attach functions to the global window object */
window.toggleNotes = toggleNotes;
window.addNote = addNote;
window.loadNotes = loadNotes;
