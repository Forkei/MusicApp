// public/js/api.js

async function fetchSongs(query) {
    const url = query ? `/api/songs?q=${query}` : '/api/songs';
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Network response was not ok: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching songs:', error);
        throw error; // Re-throw the error for the caller to handle
    }
}

async function downloadSong(result) {
    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: result.url, title: result.title, id: result.id, uploader: result.uploader })
        });

        if (!response.ok) {
            // Try to parse the JSON error response
            let errorData;
            try {
                errorData = await response.json();
            } catch (parseError) {
                // If JSON parsing fails, use the status text
                throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
            }
            throw new Error(errorData.error || `Network response was not ok: ${response.status}`);
        }
        return await response.json();

    } catch (error) {
        console.error('Error downloading song:', error);
        throw error; // Re-throw the error
    }
}

async function deleteSong(songId) {
    try {
        const response = await fetch(`/api/delete/${songId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error(`Network response was not ok: ${response.status}`);
        }
        return await response.json(); // Or you might not return anything for a DELETE
    } catch (error) {
        console.error('Error deleting song:', error);
        throw error; // Re-throw the error
    }
}

async function searchSongs(query) {
  try {
    const response = await fetch(`/api/searchall?q=${query}`);
    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error searching songs:', error);
    throw error;
  }
}

// You could add other API functions here, e.g., for getting the queue, etc.

export { fetchSongs, downloadSong, deleteSong, searchSongs };