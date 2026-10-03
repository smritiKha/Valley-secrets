const API_BASE = "http://localhost:8080/api/places";
const AUTH_API = "http://localhost:8080/api/auth";
const VISITOR_AUTH_API = "http://localhost:8080/api/visitor-auth";

let places = [];
let currentFilter = 'all';
let placeSearchQuery = '';
let currentPlaceSort = 'featured';
let showingFavoritesOnly = false;
let favoritePlaceIds = loadFavoritePlaceIds();
let activePlaceId = null;
let placesMap = null;
let placeMarkers = null;
let placeMarkersById = new Map();
let communityReviewRequestSequence = 0;
let placeReviewRequestSequence = 0;
let selectedRating = 0;
let ratingSubmitting = false;
let visitorAccount = null;
let visitorAuthMode = 'login';
let visitorAuthReturnToReview = false;

function getAdminToken() {
    return localStorage.getItem("admin_session_token");
}

function getVisitorToken() {
    return localStorage.getItem('visitor_session_token');
}

function getReviewVisitorId() {
    let visitorId = localStorage.getItem('review_visitor_id');
    if (!visitorId) {
        visitorId = crypto.randomUUID();
        localStorage.setItem('review_visitor_id', visitorId);
    }
    return visitorId;
}

function isAdminAuthenticated() {
    return !!getAdminToken();
}

function loadFavoritePlaceIds() {
    try {
        const saved = JSON.parse(localStorage.getItem('saved_place_ids') || '[]');
        return new Set(Array.isArray(saved) ? saved.filter(id => Number.isInteger(id)) : []);
    } catch (error) {
        console.warn('Could not read saved places:', error);
        return new Set();
    }
}

function persistFavoritePlaceIds() {
    try {
        const storageKey = visitorAccount
            ? `saved_place_ids_${visitorAccount.email}`
            : 'saved_place_ids';
        localStorage.setItem(storageKey, JSON.stringify([...favoritePlaceIds]));
    } catch (error) {
        console.error('Could not save favorite places:', error);
    }
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function getPlaceShareUrl(placeId) {
    const url = new URL(window.location.href);
    url.hash = `place=${placeId}`;
    return url.href;
}

function syncPlaceUrl(placeId) {
    const url = new URL(window.location.href);
    url.hash = placeId ? `place=${placeId}` : '';
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

async function loadPlaces() {
    try {
        const response = await fetch(API_BASE);
        if (!response.ok) throw new Error(`Places request failed: HTTP ${response.status}`);
        places = await response.json();
        document.getElementById('places-status').classList.add('hidden');
        const placeIds = new Set(places.map(place => place.id));
        favoritePlaceIds = new Set([...favoritePlaceIds].filter(id => placeIds.has(id)));
        persistFavoritePlaceIds();
        renderPlaces();
        if (visitorAccount) saveAccountFavorites();
        loadCommunityReviews();
        if (activePlaceId && places.some(place => place.id === activePlaceId)) {
            selectPlace(activePlaceId, false, false);
        } else {
            const requestedPlaceId = Number(new URLSearchParams(window.location.hash.slice(1)).get('place'));
            if (Number.isSafeInteger(requestedPlaceId) && places.some(place => place.id === requestedPlaceId)) {
                selectPlace(requestedPlaceId, false, false);
            } else if (activePlaceId) {
                activePlaceId = null;
                document.getElementById('active-place-details').classList.add('hidden');
                closePlaceDetails(false);
            }
        }
    } catch (err) {
        const status = document.getElementById('places-status');
        document.getElementById('places-status-message').textContent =
            'Places are temporarily unavailable. Check your connection and try again.';
        status.classList.remove('hidden');
        const feed = document.getElementById('community-reviews-feed');
        if (!places.length) {
            feed.replaceChildren();
            const message = document.createElement('p');
            message.className = 'text-xs text-rose-600';
            message.textContent = 'Community reviews will appear when the places service is available.';
            feed.appendChild(message);
        }
        console.error('Could not load places:', err);
    }
}

function filterCity(city, selectedButton) {
    currentFilter = city;
    document.querySelectorAll('.city-filter-btn').forEach(button => {
        const active = button === selectedButton;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    renderPlaces();
}

function setPlaceSearch(value) {
    placeSearchQuery = value.trim().toLocaleLowerCase();
    renderPlaces();
}

function setPlaceSort(value) {
    currentPlaceSort = value;
    renderPlaces();
}

function toggleFavoritesFilter() {
    showingFavoritesOnly = !showingFavoritesOnly;
    const button = document.getElementById('favorites-filter');
    button.setAttribute('aria-pressed', String(showingFavoritesOnly));
    button.classList.toggle('border-[#91ad83]', showingFavoritesOnly);
    button.classList.toggle('bg-[#f1f5ef]', showingFavoritesOnly);
    renderPlaces();
}

function clearPlaceSearch() {
    placeSearchQuery = '';
    showingFavoritesOnly = false;
    currentFilter = 'all';
    document.getElementById('place-search').value = '';
    const button = document.getElementById('favorites-filter');
    button.setAttribute('aria-pressed', 'false');
    button.classList.remove('border-[#91ad83]', 'bg-[#f1f5ef]');
    document.querySelectorAll('.city-filter-btn').forEach(cityButton => {
        const active = cityButton.textContent.trim() === 'All';
        cityButton.classList.toggle('is-active', active);
        cityButton.setAttribute('aria-pressed', String(active));
    });
    renderPlaces();
}

function getVisiblePlaces() {
    let visiblePlaces = currentFilter === 'all'
        ? [...places]
        : places.filter(place => place.city === currentFilter);
    if (placeSearchQuery) {
        visiblePlaces = visiblePlaces.filter(place =>
            `${place.name} ${place.city} ${place.description || ''}`.toLocaleLowerCase().includes(placeSearchQuery));
    }
    if (showingFavoritesOnly) {
        visiblePlaces = visiblePlaces.filter(place => favoritePlaceIds.has(place.id));
    }
    if (currentPlaceSort === 'name') {
        visiblePlaces.sort((a, b) => a.name.localeCompare(b.name));
    } else if (currentPlaceSort === 'rating') {
        const averageRating = place => place.ratings?.length
            ? place.ratings.reduce((sum, rating) => sum + rating, 0) / place.ratings.length
            : -1;
        visiblePlaces.sort((a, b) => averageRating(b) - averageRating(a) || a.name.localeCompare(b.name));
    }
    return visiblePlaces;
}

function toggleFavorite(id, button) {
    if (favoritePlaceIds.has(id)) favoritePlaceIds.delete(id);
    else favoritePlaceIds.add(id);
    persistFavoritePlaceIds();
    button.setAttribute('aria-pressed', String(favoritePlaceIds.has(id)));
    renderPlaces();
    if (visitorAccount) saveAccountFavorites();
}

async function saveAccountFavorites() {
    if (!visitorAccount || !getVisitorToken()) return;
    const status = document.getElementById('favorites-sync-status');
    if (status) status.textContent = 'Syncing saved places…';
    try {
        const response = await fetch(`${VISITOR_AUTH_API}/favorites`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Visitor-Token': getVisitorToken()
            },
            body: JSON.stringify({ placeIds: [...favoritePlaceIds] })
        });
        if (!response.ok) {
            const message = await response.text();
            throw new Error(message || `Could not sync saved places (HTTP ${response.status}).`);
        }
        if (status) status.textContent = 'Saved places synced to your account.';
    } catch (error) {
        if (status) status.textContent = 'Could not sync saved places. Check your connection and try again.';
        console.error('Could not sync saved places:', error);
    }
}

function revealPlaceOnMap(place) {
    if (placeMarkersById.has(place.id)) return;
    currentFilter = place.city;
    placeSearchQuery = '';
    showingFavoritesOnly = false;
    document.getElementById('place-search').value = '';
    const favoritesButton = document.getElementById('favorites-filter');
    favoritesButton.setAttribute('aria-pressed', 'false');
    favoritesButton.classList.remove('border-[#91ad83]', 'bg-[#f1f5ef]');
    document.querySelectorAll('.city-filter-btn').forEach(button => {
        const active = button.textContent.trim() === place.city;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    renderPlaces();
}

function updateUIVisibility() {
    const authenticated = isAdminAuthenticated();
    document.getElementById("login-nav-btn").classList.toggle("hidden", authenticated);
    document.getElementById("logout-nav-btn").classList.toggle("hidden", !authenticated);
    document.getElementById("visitor-login-nav-btn").classList.toggle("hidden", Boolean(visitorAccount));
    document.getElementById("visitor-logout-nav-btn").classList.toggle("hidden", !visitorAccount);
    const visitorLabel = document.getElementById("visitor-account-label");
    visitorLabel.textContent = visitorAccount ? `Hi, ${visitorAccount.username || visitorAccount.email}` : '';
    visitorLabel.classList.toggle("hidden", !visitorAccount);
    document.getElementById("review-form").classList.toggle("hidden", authenticated || !visitorAccount);
    document.getElementById("review-auth-required").classList.toggle("hidden", authenticated || Boolean(visitorAccount));
    const accountEmail = document.getElementById('review-account-email');
    accountEmail.textContent = visitorAccount ? `Signed in as ${visitorAccount.email}` : '';
    accountEmail.classList.toggle('hidden', !visitorAccount || authenticated);
    const reviewerNameField = document.getElementById('reviewer-name-field');
    reviewerNameField.classList.toggle('hidden', Boolean(visitorAccount) || authenticated);
    document.getElementById('reviewer-name').required = !visitorAccount && !authenticated;
    document.getElementById("admin-management-panel").classList.toggle("hidden", !authenticated);
    renderPlaces();
    loadCommunityReviews();
    if (activePlaceId) loadReviewsForPlace(activePlaceId);
}

function renderPlaces() {
    const container = document.getElementById('places-container');
    container.replaceChildren();
    const authenticated = isAdminAuthenticated();
    const filteredPlaces = getVisiblePlaces();
    document.getElementById('hero-place-count').textContent = places.length;
    document.getElementById('favorites-count').textContent = favoritePlaceIds.size;
    document.getElementById('results-summary').textContent =
        `Showing ${filteredPlaces.length} of ${places.length} places${currentFilter === 'all' ? '' : ` in ${currentFilter}`}`;
    document.getElementById('clear-search').classList.toggle('hidden',
        !placeSearchQuery && !showingFavoritesOnly && currentFilter === 'all');

    if (filteredPlaces.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'col-span-full rounded-2xl border border-dashed border-[#d8dfd4] bg-white px-6 py-12 text-center';
        const title = document.createElement('h3');
        title.className = 'text-base font-semibold text-slate-800';
        title.textContent = !places.length
            ? 'Places are temporarily unavailable'
            : showingFavoritesOnly ? 'No saved places here yet' : 'No places match your search';
        const description = document.createElement('p');
        description.className = 'mt-2 text-sm text-slate-500';
        description.textContent = !places.length
            ? 'Try again in a moment to explore the valley.'
            : showingFavoritesOnly
            ? 'Tap the heart on any place to keep it close.'
            : 'Try a different name, neighborhood, or city.';
        emptyState.append(title, description);
        container.appendChild(emptyState);
        renderPlacesMap();
        return;
    }

    filteredPlaces.forEach(p => {
        const avgRating = p.ratings && p.ratings.length ? (p.ratings.reduce((a,b)=>a+b,0)/p.ratings.length).toFixed(1) : "Unrated";
        const article = document.createElement('article');
        article.className = `place-card group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-[#e7e9e2] bg-white shadow-sm${activePlaceId === p.id ? ' is-selected' : ''}`;
        article.dataset.placeId = p.id;
        article.tabIndex = 0;
        article.setAttribute('role', 'group');
        article.setAttribute('aria-label', `Show ${p.name} and its location on the map`);
        article.setAttribute('aria-current', String(activePlaceId === p.id));
        article.addEventListener('click', () => selectPlace(p.id));
        article.addEventListener('keydown', event => {
            if (event.target === article && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                selectPlace(p.id);
            }
        });

        const figure = document.createElement('figure');
        figure.className = 'relative h-48 overflow-hidden bg-[#edf0ea]';
        if (p.photoUrl) {
            const image = document.createElement('img');
            image.src = p.photoUrl;
            image.alt = p.name;
            image.loading = 'lazy';
            image.className = 'h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]';
            figure.appendChild(image);
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'flex h-full items-center justify-center text-sm text-slate-400';
            placeholder.textContent = 'Photo coming soon';
            figure.appendChild(placeholder);
        }
        const imageShade = document.createElement('div');
        imageShade.className = 'absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10';
        figure.appendChild(imageShade);
        const cityTag = document.createElement('span');
        cityTag.className = 'absolute bottom-3 left-3 rounded-full border border-white/30 bg-white/90 px-3 py-1 text-[11px] font-semibold text-[#345743] shadow-sm backdrop-blur';
        cityTag.textContent = p.city;
        figure.appendChild(cityTag);
        const favoriteButton = document.createElement('button');
        favoriteButton.type = 'button';
        favoriteButton.className = 'absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-lg text-rose-600 shadow-sm transition hover:scale-105 cursor-pointer';
        favoriteButton.textContent = favoritePlaceIds.has(p.id) ? '♥' : '♡';
        favoriteButton.setAttribute('aria-label', favoritePlaceIds.has(p.id) ? `Remove ${p.name} from saved places` : `Save ${p.name}`);
        favoriteButton.setAttribute('aria-pressed', String(favoritePlaceIds.has(p.id)));
        favoriteButton.addEventListener('click', event => {
            event.stopPropagation();
            toggleFavorite(p.id, favoriteButton);
        });
        figure.appendChild(favoriteButton);
        article.appendChild(figure);

        const body = document.createElement('div');
        body.className = 'flex flex-1 flex-col p-4';
        const titleRow = document.createElement('div');
        titleRow.className = 'mb-2 flex items-start justify-between gap-2';
        const title = document.createElement('h3');
        title.className = 'text-base font-semibold leading-snug text-slate-900';
        title.textContent = p.name;
        const rating = document.createElement('span');
        rating.className = 'shrink-0 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700';
        rating.textContent = `★ ${avgRating}`;
        titleRow.append(title, rating);
        body.appendChild(titleRow);
        const description = document.createElement('p');
        description.className = 'line-clamp-3 flex-1 text-xs leading-5 text-slate-600';
        description.textContent = p.description;
        body.appendChild(description);
        if (p.photoCredit && p.photoSourceUrl) {
            const credit = document.createElement('a');
            credit.href = p.photoSourceUrl;
            credit.target = '_blank';
            credit.rel = 'noopener noreferrer';
            credit.className = 'mt-2 w-fit text-[10px] text-slate-400 underline decoration-slate-300 underline-offset-2';
            credit.textContent = `Photo: ${p.photoCredit}`;
            credit.addEventListener('click', event => event.stopPropagation());
            body.appendChild(credit);
        }
        const actions = document.createElement('div');
        actions.className = 'mt-4 flex gap-2 border-t border-[#edf0ea] pt-3';
        if (authenticated) {
            actions.innerHTML = `<button onclick="event.stopPropagation(); setupEdit(${p.id})" class="flex-1 rounded-lg bg-[#f1f5ef] py-2 text-xs font-semibold text-[#345743] hover:bg-[#e5ede2] cursor-pointer">Edit</button><button onclick="event.stopPropagation(); deletePlace(${p.id})" class="flex-1 rounded-lg bg-rose-50 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer">Remove</button>`;
        } else {
            const viewButton = document.createElement('button');
            viewButton.type = 'button';
            viewButton.className = 'flex w-full items-center justify-between rounded-lg bg-[#f4f6f2] px-3 py-2.5 text-xs font-semibold text-[#345743] transition hover:bg-[#eaf0e7] cursor-pointer';
            viewButton.innerHTML = '<span>Explore this place</span><span aria-hidden="true">→</span>';
            viewButton.addEventListener('click', event => {
                event.stopPropagation();
                selectPlace(p.id);
            });
            actions.appendChild(viewButton);
        }
        body.appendChild(actions);
        article.appendChild(body);
        container.appendChild(article);
    });
    renderPlacesMap();
}

function getCoordinatesFromMapUrl(mapUrl) {
    if (!mapUrl) return null;

    let url;
    try {
        url = new URL(mapUrl);
    } catch {
        return null;
    }
    if (url.protocol !== 'https:') return null;
    if (url.hostname !== 'google.com' && !url.hostname.endsWith('.google.com')) return null;

    let decodedUrl;
    try {
        decodedUrl = decodeURIComponent(url.href);
    } catch {
        decodedUrl = url.href;
    }

    const patterns = [
        /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
        /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
        /(?:ll|query|q)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i
    ];
    for (const pattern of patterns) {
        const match = decodedUrl.match(pattern);
        if (!match) continue;
        const latitude = Number(match[1]);
        const longitude = Number(match[2]);
        if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
            return [latitude, longitude];
        }
    }
    return null;
}

function getGoogleMapsDirectionsUrl(place) {
    const coordinates = getCoordinatesFromMapUrl(place.mapUrl);
    const destination = coordinates
        ? coordinates.join(',')
        : `${place.name}, ${place.city}, Nepal`;
    const directionsUrl = new URL('https://www.google.com/maps/dir/');
    directionsUrl.searchParams.set('api', '1');
    directionsUrl.searchParams.set('destination', destination);
    directionsUrl.searchParams.set('travelmode', 'driving');
    return directionsUrl.href;
}

function renderPlacesMap() {
    const mapElement = document.getElementById('places-map');
    const status = document.getElementById('map-status');
    if (!mapElement || !status || !window.L) {
        if (status) status.textContent = 'The map could not be loaded. Check your internet connection and refresh.';
        return;
    }

    if (!placesMap) {
        placesMap = L.map(mapElement).setView([27.7172, 85.3240], 11);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(placesMap);
        placeMarkers = L.featureGroup().addTo(placesMap);
    }

    placeMarkers.clearLayers();
    placeMarkersById.clear();
    const visiblePlaces = getVisiblePlaces();
    const mappedPlaces = visiblePlaces
        .map(place => ({ place, coordinates: getCoordinatesFromMapUrl(place.mapUrl) }))
        .filter(item => item.coordinates);

    mappedPlaces.forEach(({ place, coordinates }) => {
        const marker = L.marker(coordinates);
        const popup = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = place.name;
        popup.appendChild(title);
        const city = document.createElement('div');
        city.textContent = place.city;
        popup.appendChild(city);
        const link = document.createElement('a');
        link.href = getGoogleMapsDirectionsUrl(place);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.title = 'Google Maps uses your current location when available.';
        link.textContent = 'Get directions in Google Maps';
        popup.appendChild(link);
        marker.bindPopup(popup);
        marker.on('click', () => selectPlace(place.id, false));
        placeMarkers.addLayer(marker);
        placeMarkersById.set(place.id, marker);
    });

    if (mappedPlaces.length) {
        status.textContent = `${mappedPlaces.length} place${mappedPlaces.length === 1 ? '' : 's'} on the map. Select a marker for details.`;
        placesMap.fitBounds(placeMarkers.getBounds().pad(0.15), { maxZoom: 14 });
    } else {
        status.textContent = 'No places with coordinates in their Google Maps URL match this filter.';
        placesMap.setView([27.7172, 85.3240], 11);
    }
    setTimeout(() => placesMap.invalidateSize(), 0);
}

function setVisitorAuthMode(mode) {
    visitorAuthMode = mode;
    const registering = mode === 'register';
    const usernameField = document.getElementById('visitor-username-field');
    usernameField.classList.toggle('hidden', !registering);
    document.getElementById('visitor-username').required = registering;
    document.getElementById('visitor-auth-title').textContent = registering ? 'Create your account' : 'Sign in';
    document.getElementById('visitor-auth-description').textContent = registering
        ? 'Create an account with your email and a password to save places and reviews.'
        : 'Sign in to sync saved places and write reviews.';
    document.getElementById('visitor-auth-submit').textContent = registering ? 'Create account' : 'Sign in';
    document.getElementById('visitor-auth-switch-copy').textContent = registering ? 'Already have an account?' : 'New here?';
    document.getElementById('visitor-auth-switch').textContent = registering ? 'Sign in' : 'Create an account';
    document.getElementById('visitor-password').autocomplete = registering ? 'new-password' : 'current-password';
    document.getElementById('visitor-auth-status').classList.add('hidden');
}

function toggleVisitorAuthMode() {
    setVisitorAuthMode(visitorAuthMode === 'login' ? 'register' : 'login');
}

function openVisitorAuthModal(returnToReview = false) {
    visitorAuthReturnToReview = returnToReview;
    setVisitorAuthMode('login');
    document.getElementById('visitor-auth-modal').classList.remove('hidden');
    requestAnimationFrame(() => document.getElementById('visitor-email').focus({ preventScroll: true }));
}

function closeVisitorAuthModal() {
    document.getElementById('visitor-auth-modal').classList.add('hidden');
    document.getElementById('visitor-auth-form').reset();
    visitorAuthReturnToReview = false;
    if (activePlaceId && !document.getElementById('active-place-details').classList.contains('hidden')) {
        const reviewButton = [...document.querySelectorAll('#place-detail-actions button')]
            .find(button => button.textContent === 'Write a review');
        reviewButton?.focus({ preventScroll: true });
    } else {
        document.getElementById('visitor-login-nav-btn').focus({ preventScroll: true });
    }
}

async function submitVisitorAuth(event) {
    event.preventDefault();
    const form = document.getElementById('visitor-auth-form');
    if (!form.reportValidity()) return;
    const status = document.getElementById('visitor-auth-status');
    const submitButton = document.getElementById('visitor-auth-submit');
    const email = document.getElementById('visitor-email').value.trim().toLowerCase();
    const password = document.getElementById('visitor-password').value;
    const username = document.getElementById('visitor-username').value.trim();
    const endpoint = visitorAuthMode === 'register' ? 'register' : 'login';
    submitButton.disabled = true;
    submitButton.textContent = visitorAuthMode === 'register' ? 'Creating account…' : 'Signing in…';
    status.classList.add('hidden');
    try {
        const response = await fetch(`${VISITOR_AUTH_API}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        if (!response.ok) {
            const message = await response.text();
            if (visitorAuthMode === 'login' && response.status === 404) {
                throw new Error('No account exists for this email. Create an account below, or check your email address.');
            }
            throw new Error(message || `Could not sign in (HTTP ${response.status}).`);
        }
        const session = await response.json();
        localStorage.removeItem('admin_session_token');
        localStorage.setItem('visitor_session_token', session.token);
        visitorAccount = { email: session.email, username: session.username };
        updateUIVisibility();
        const guestFavorites = loadFavoritePlaceIds();
        try {
            const favoritesResponse = await fetch(`${VISITOR_AUTH_API}/favorites`, {
                headers: { 'X-Visitor-Token': session.token }
            });
            if (!favoritesResponse.ok) {
                const message = await favoritesResponse.text();
                throw new Error(message || `Could not load saved places (HTTP ${favoritesResponse.status}).`);
            }
            const accountFavorites = await favoritesResponse.json();
            favoritePlaceIds = new Set([...accountFavorites, ...guestFavorites]);
            persistFavoritePlaceIds();
            localStorage.removeItem('saved_place_ids');
            const saveResponse = await fetch(`${VISITOR_AUTH_API}/favorites`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Visitor-Token': session.token
                },
                body: JSON.stringify({ placeIds: [...favoritePlaceIds] })
            });
            if (!saveResponse.ok) {
                const message = await saveResponse.text();
                throw new Error(message || `Could not sync saved places (HTTP ${saveResponse.status}).`);
            }
            document.getElementById('favorites-sync-status').textContent = 'Saved places are synced to your account.';
        } catch (error) {
            document.getElementById('favorites-sync-status').textContent =
                'You are signed in, but saved places could not sync. Check your connection and try again.';
            console.error('Could not sync saved places after sign-in:', error);
        }
        const returnToReview = visitorAuthReturnToReview;
        closeVisitorAuthModal();
        renderPlaces();
        if (activePlaceId) loadReviewsForPlace(activePlaceId);
        if (returnToReview) focusPlaceReviewForm();
    } catch (error) {
        status.textContent = error.message || 'Could not sign in. Please try again.';
        status.className = 'text-xs text-rose-600';
        status.classList.remove('hidden');
        console.error('Visitor sign-in failed:', error);
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = visitorAuthMode === 'register' ? 'Create account' : 'Sign in';
    }
}

async function restoreVisitorSession() {
    const token = getVisitorToken();
    if (!token) return;
    if (isAdminAuthenticated()) {
        localStorage.removeItem('visitor_session_token');
        return;
    }
    try {
        const response = await fetch(`${VISITOR_AUTH_API}/me`, {
            headers: { 'X-Visitor-Token': token }
        });
        if (response.status === 401) {
            localStorage.removeItem('visitor_session_token');
            return;
        }
        if (!response.ok) throw new Error(`Could not restore account (HTTP ${response.status}).`);
        visitorAccount = await response.json();
        const favoritesResponse = await fetch(`${VISITOR_AUTH_API}/favorites`, {
            headers: { 'X-Visitor-Token': token }
        });
        if (!favoritesResponse.ok) {
            const message = await favoritesResponse.text();
            throw new Error(message || `Could not load saved places (HTTP ${favoritesResponse.status}).`);
        }
        favoritePlaceIds = new Set(await favoritesResponse.json());
        persistFavoritePlaceIds();
        updateUIVisibility();
    } catch (error) {
        console.error('Could not restore visitor account:', error);
        document.getElementById('favorites-sync-status').textContent =
            'Could not load your synced saved places. Check your connection and refresh.';
    }
}

async function logoutVisitor() {
    const token = getVisitorToken();
    let sessionRevocationFailed = false;
    if (token) {
        try {
            const response = await fetch(`${VISITOR_AUTH_API}/session`, {
                method: 'DELETE',
                headers: { 'X-Visitor-Token': token }
            });
            if (!response.ok) throw new Error(`Could not sign out (HTTP ${response.status}).`);
        } catch (error) {
            sessionRevocationFailed = true;
            console.error('Could not revoke visitor session:', error);
        }
    }
    localStorage.removeItem('visitor_session_token');
    visitorAccount = null;
    favoritePlaceIds = loadFavoritePlaceIds();
    updateUIVisibility();
    if (sessionRevocationFailed) {
        document.getElementById('favorites-sync-status').textContent =
            'Signed out on this device, but the server could not revoke the session. Check your connection.';
    }
}

function openLoginModal() {
    const modal = document.getElementById("login-modal");
    modal.classList.remove("hidden");
    document.getElementById("login-error-msg").classList.add("hidden");
    document.getElementById("login-username").focus();
}

function setPlaceDetailsSheet(isOpen) {
    const details = document.getElementById('active-place-details');
    const backdrop = document.getElementById('place-detail-backdrop');
    const closeButton = document.getElementById('close-place-details');
    const useSheet = isOpen && window.matchMedia('(max-width: 1023px)').matches;
    details.classList.toggle('mobile-open', useSheet);
    details.setAttribute('role', useSheet ? 'dialog' : 'region');
    details.setAttribute('aria-modal', String(useSheet));
    backdrop.classList.toggle('is-visible', useSheet);
    document.body.classList.toggle('overflow-hidden', useSheet);
    closeButton.classList.toggle('hidden', !useSheet);
    closeButton.classList.toggle('flex', useSheet);
    if (useSheet) closeButton.focus({ preventScroll: true });
}

function closePlaceDetails(restoreFocus = true) {
    const details = document.getElementById('active-place-details');
    details.classList.remove('mobile-open');
    details.classList.add('hidden');
    details.setAttribute('aria-modal', 'false');
    document.getElementById('place-detail-backdrop').classList.remove('is-visible');
    document.body.classList.remove('overflow-hidden');
    if (restoreFocus && activePlaceId) {
        document.querySelector(`.place-card[data-place-id="${activePlaceId}"]`)?.focus({ preventScroll: true });
    }
}

function closeLoginModal() {
    document.getElementById("login-modal").classList.add("hidden");
    document.getElementById("login-error-msg").classList.add("hidden");
    document.getElementById("login-username").value = "";
    document.getElementById("login-password").value = "";
    document.getElementById("login-submit").disabled = false;
    document.getElementById("login-submit").textContent = 'Login';
    document.getElementById("login-nav-btn").focus();
}

async function submitAdminLogin(event) {
    event.preventDefault();
    const user = document.getElementById("login-username").value.trim();
    const pass = document.getElementById("login-password").value;
    const errBox = document.getElementById("login-error-msg");
    const submitButton = document.getElementById("login-submit");
    submitButton.disabled = true;
    submitButton.textContent = 'Signing in…';
    errBox.classList.add("hidden");

    try {
        const response = await fetch(`${AUTH_API}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });

        if (response.ok) {
            const token = await response.text();
            localStorage.setItem("admin_session_token", token);
            if (visitorAccount) await logoutVisitor();
            closeLoginModal();
            updateUIVisibility();
        } else {
            const message = await response.text();
            errBox.innerText = message || (response.status === 401
                ? "That username or password doesn’t match. Please try again."
                : `Login failed (HTTP ${response.status}). Please try again.`);
            errBox.classList.remove("hidden");
        }
    } catch (error) {
        errBox.innerText = "Couldn’t connect to the login service. Check that the backend is running and try again.";
        errBox.classList.remove("hidden");
        console.error('Could not sign in:', error);
    } finally {
        if (!document.getElementById("login-modal").classList.contains("hidden")) {
            submitButton.disabled = false;
            submitButton.textContent = 'Login';
        }
    }
}

function logoutAdmin() {
    localStorage.removeItem("admin_session_token");
    activePlaceId = null;
    closePlaceDetails(false);
    updateUIVisibility();
}

function selectPlace(id, scrollToMap = false, focusDetails = true) {
    const placeChanged = activePlaceId !== id;
    activePlaceId = id;
    const place = places.find(p => p.id === id);
    if(!place) return;
    syncPlaceUrl(id);
    if (placeChanged) selectedRating = 0;
    revealPlaceOnMap(place);
    document.querySelectorAll('.place-card').forEach(card => {
        const selected = Number(card.dataset.placeId) === id;
        card.classList.toggle('is-selected', selected);
        card.setAttribute('aria-current', String(selected));
    });
    document.getElementById('active-place-details').classList.remove('hidden');
    document.getElementById('selected-place-title').innerText = place.name;
    document.getElementById('place-review-context').textContent = `Ratings and reviews for ${place.name}`;
    const ratingAverage = place.ratings?.length
        ? (place.ratings.reduce((sum, rating) => sum + rating, 0) / place.ratings.length).toFixed(1)
        : null;
    document.getElementById('place-detail-rating').textContent =
        ratingAverage ? `★ ${ratingAverage} · ${place.ratings.length} ratings` : 'Not rated yet';
    const photoContainer = document.getElementById('place-detail-photo-container');
    const detailPhoto = document.getElementById('place-detail-photo');
    const photoCredit = document.getElementById('place-detail-photo-credit');
    if (place.photoUrl) {
        detailPhoto.src = place.photoUrl;
        detailPhoto.alt = `Photo of ${place.name}`;
        photoContainer.classList.remove('hidden');
        photoCredit.textContent = place.photoCredit
            ? `Photo: ${place.photoCredit}`
            : `Photo of ${place.name}`;
        if (place.photoSourceUrl) {
            const sourceLink = document.createElement('a');
            sourceLink.href = place.photoSourceUrl;
            sourceLink.target = '_blank';
            sourceLink.rel = 'noopener noreferrer';
            sourceLink.className = 'ml-1 underline';
            sourceLink.textContent = 'Source';
            photoCredit.appendChild(sourceLink);
        }
    } else {
        detailPhoto.removeAttribute('src');
        photoContainer.classList.add('hidden');
        photoCredit.replaceChildren();
    }
    document.getElementById('place-selected-description').textContent = place.description || '';
    const shareStatus = document.getElementById('place-share-status');
    shareStatus.classList.add('hidden');
    shareStatus.replaceChildren();
    document.getElementById('review-form-title').textContent = `Write a review for ${place.name}`;
    renderPlaceDetailActions(place);
    updateRatingControls();
    showPlaceOnMap(id, scrollToMap);
    loadReviewsForPlace(id);
    if (focusDetails) setPlaceDetailsSheet(true);
}

function renderPlaceDetailActions(place) {
    const actions = document.getElementById('place-detail-actions');
    actions.replaceChildren();

    const directions = document.createElement('a');
    directions.href = getGoogleMapsDirectionsUrl(place);
    directions.target = '_blank';
    directions.rel = 'noopener noreferrer';
    directions.title = 'Google Maps uses your current location when available.';
    directions.className = 'inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#294b36] px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-[#203d2b]';
    directions.textContent = 'Visit this place';
    actions.appendChild(directions);

    const shareButton = document.createElement('button');
    shareButton.type = 'button';
    shareButton.className = 'inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-[#dce5d8] bg-white px-3 py-2.5 text-xs font-semibold text-[#345743] transition hover:bg-[#f1f5ef] cursor-pointer';
    shareButton.textContent = 'Share place';
    shareButton.addEventListener('click', () => sharePlace(place));
    actions.appendChild(shareButton);

    const reviewButton = document.createElement('button');
    reviewButton.type = 'button';
    reviewButton.className = 'inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-[#dce5d8] bg-white px-3 py-2.5 text-xs font-semibold text-[#345743] transition hover:bg-[#f1f5ef] cursor-pointer';
    reviewButton.textContent = 'Write a review';
    reviewButton.addEventListener('click', focusPlaceReviewForm);
    actions.appendChild(reviewButton);
}

async function sharePlace(place) {
    const url = getPlaceShareUrl(place.id);
    const status = document.getElementById('place-share-status');
    status.replaceChildren();

    try {
        if (navigator.share) {
            await navigator.share({
                title: place.name,
                text: `Explore ${place.name} in ${place.city}, Nepal with Valley Secrets.`,
                url
            });
            status.textContent = 'Place shared.';
        } else if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(url);
            status.textContent = 'Place link copied. Share it with a friend.';
        } else {
            status.append('Copy this link to share the place: ');
            const link = document.createElement('a');
            link.href = url;
            link.textContent = url;
            link.className = 'underline';
            status.appendChild(link);
        }
        status.classList.remove('hidden');
    } catch (error) {
        if (error.name === 'AbortError') return;
        status.textContent = 'Could not open sharing or copy the link. Please try again.';
        status.classList.remove('hidden');
        console.error('Could not share place:', error);
    }
}

function focusPlaceReviewForm() {
    const place = places.find(item => item.id === activePlaceId);
    if (!place) {
        document.getElementById('places-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.getElementById('place-search').focus({ preventScroll: true });
        return;
    }
    if (!visitorAccount) {
        openVisitorAuthModal(true);
        return;
    }
    document.getElementById('review-form').classList.remove('hidden');
    document.getElementById('review-auth-required').classList.add('hidden');
    if (window.matchMedia('(max-width: 1023px)').matches) {
        setPlaceDetailsSheet(true);
    }
    const firstReviewField = document.getElementById('review-text');
    requestAnimationFrame(() => {
        firstReviewField.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstReviewField.focus({ preventScroll: true });
    });
}

function updateRatingControls() {
    const place = places.find(item => item.id === activePlaceId);
    document.querySelectorAll('#rating-stars-input button').forEach((button, index) => {
        const isSelected = index < selectedRating;
        button.setAttribute('aria-pressed', String(index + 1 === selectedRating));
        button.classList.toggle('text-amber-400', isSelected);
        button.classList.toggle('text-slate-300', !isSelected);
        button.disabled = ratingSubmitting;
    });
    const status = document.getElementById('rating-status');
    status.textContent = selectedRating
        ? `${selectedRating} out of 5 stars selected for ${place?.name || 'this place'}. Save it now or include it with your review.`
        : `Choose a rating for ${place?.name || 'this place'}.`;
    status.classList.remove('text-rose-600', 'text-emerald-700');
    status.classList.add('text-slate-500');
    const submitButton = document.getElementById('rating-submit');
    submitButton.disabled = !selectedRating || ratingSubmitting;
    submitButton.textContent = ratingSubmitting ? 'Saving rating...' : 'Save rating';
}

function selectRating(stars) {
    if (ratingSubmitting || !Number.isInteger(stars) || stars < 1 || stars > 5) return;
    selectedRating = stars;
    updateRatingControls();
}

async function loadReviewsForPlace(placeId) {
    const requestSequence = ++placeReviewRequestSequence;
    const feed = document.getElementById('place-reviews-feed');
    const count = document.getElementById('place-reviews-count');
    const place = places.find(item => item.id === placeId);
    if (!place) return;
    feed.replaceChildren();
    const loading = document.createElement('p');
    loading.className = 'text-xs text-slate-400 italic';
    loading.textContent = `Loading reviews for ${place.name}…`;
    feed.appendChild(loading);
    count.textContent = '';

    try {
        const headers = { 'X-Visitor-Id': getReviewVisitorId() };
        if (isAdminAuthenticated()) headers['X-Admin-Token'] = getAdminToken();
        const response = await fetch(`${API_BASE}/${placeId}/reviews`, { headers });
        if (!response.ok) throw new Error(`Could not load reviews (HTTP ${response.status}).`);
        const reviews = await response.json();
        if (placeReviewRequestSequence !== requestSequence || activePlaceId !== placeId) return;
        count.textContent = `${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'}`;
        renderReviewsFeed(reviews, place, false, 'place-reviews-feed');
    } catch (error) {
        if (placeReviewRequestSequence !== requestSequence || activePlaceId !== placeId) return;
        feed.replaceChildren();
        const message = document.createElement('p');
        message.className = 'text-xs text-rose-600';
        message.textContent = 'Reviews could not be loaded. Please try again.';
        feed.appendChild(message);
        console.error(`Could not load reviews for ${place.name}:`, error);
    }
}

async function loadCommunityReviews() {
    if (!places.length) return;
    const requestSequence = ++communityReviewRequestSequence;
    const feed = document.getElementById('community-reviews-feed');
    feed.replaceChildren();
    const loading = document.createElement('p');
    loading.className = 'text-xs text-slate-400 italic';
    loading.textContent = 'Loading community reviews...';
    feed.appendChild(loading);

    try {
        const headers = { 'X-Visitor-Id': getReviewVisitorId() };
        if (isAdminAuthenticated()) headers['X-Admin-Token'] = getAdminToken();
        const reviewGroups = await Promise.all(places.map(async place => {
            const response = await fetch(`${API_BASE}/${place.id}/reviews`, { headers });
            if (!response.ok) throw new Error(`Reviews request failed for ${place.name}: HTTP ${response.status}`);
            const reviews = await response.json();
            return reviews.map(review => ({ ...review, place }));
        }));
        if (requestSequence !== communityReviewRequestSequence) return;
        const reviews = reviewGroups.flat().sort((left, right) =>
            new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
        document.getElementById('hero-review-count').textContent = reviews.length;
        renderReviewsFeed(reviews, null, false, 'community-reviews-feed');
    } catch (error) {
        if (requestSequence !== communityReviewRequestSequence) return;
        feed.replaceChildren();
        const message = document.createElement('p');
        message.className = 'text-xs text-rose-600';
        message.textContent = 'Community reviews could not be loaded. Please refresh and try again.';
        feed.appendChild(message);
        console.error('Could not load community reviews:', error);
    }
}

function renderReviewsFeed(reviews, place, loading = false, feedId = 'community-reviews-feed') {
    const feed = document.getElementById(feedId);
    feed.replaceChildren();
    const savedReviews = Array.isArray(reviews) ? reviews : [];

    for (const review of savedReviews) {
        const reviewPlace = review.place || places.find(item => item.id === review.placeId) || place;
        const reviewPlaceId = review.placeId || reviewPlace?.id;
        const article = document.createElement('article');
        article.className = 'bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-2';
        const heading = document.createElement('div');
        heading.className = 'flex justify-between gap-2 text-xs';
        const name = document.createElement('strong');
        name.className = 'text-slate-800';
        name.textContent = review.name;
        heading.appendChild(name);
        const date = document.createElement('time');
        date.className = 'text-slate-400';
        const createdAt = new Date(review.createdAt);
        if (!Number.isNaN(createdAt.getTime())) {
            date.dateTime = createdAt.toISOString();
            date.textContent = createdAt.toLocaleDateString();
        }
        heading.appendChild(date);
        article.appendChild(heading);

        const placeContext = document.createElement('div');
        placeContext.className = 'flex items-center justify-between gap-2';
        const placeLabel = document.createElement('p');
        placeLabel.className = 'text-xs font-semibold text-indigo-700';
        placeLabel.textContent = `Review for ${reviewPlace?.name || 'this place'}${reviewPlace?.city ? ` · ${reviewPlace.city}` : ''}`;
        placeContext.appendChild(placeLabel);
        if (reviewPlace && feedId !== 'place-reviews-feed') {
            const reviewPlaceButton = document.createElement('button');
            reviewPlaceButton.type = 'button';
            reviewPlaceButton.className = 'shrink-0 text-xs text-indigo-700 underline cursor-pointer';
            reviewPlaceButton.textContent = 'Review this place';
            reviewPlaceButton.addEventListener('click', () => selectPlace(reviewPlace.id, false));
            placeContext.appendChild(reviewPlaceButton);
        }
        article.appendChild(placeContext);

        if (review.rating) {
            const rating = document.createElement('p');
            rating.className = 'text-xs text-amber-500';
            rating.textContent = `${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}`;
            article.appendChild(rating);
        }

        const comment = document.createElement('p');
        comment.className = 'text-xs text-slate-700 whitespace-pre-line break-words';
        comment.textContent = review.comment;
        article.appendChild(comment);

        const replyFormId = `${feedId}-reply-form-${review.id}`;
        const showReplyFormButton = document.createElement('button');
        showReplyFormButton.type = 'button';
        showReplyFormButton.className = 'mt-1 text-xs font-semibold text-indigo-700 hover:underline cursor-pointer';
        showReplyFormButton.textContent = 'Reply';
        showReplyFormButton.setAttribute('aria-expanded', 'false');
        showReplyFormButton.setAttribute('aria-controls', replyFormId);
        article.appendChild(showReplyFormButton);

        if (review.hidden) {
            const hiddenNote = document.createElement('p');
            hiddenNote.className = 'text-xs font-semibold text-rose-600';
            hiddenNote.textContent = 'Hidden from public view';
            article.appendChild(hiddenNote);
        }

        if (review.photoUrl) {
            const photo = document.createElement('img');
            photo.src = `${new URL(API_BASE).origin}${review.photoUrl}`;
            photo.alt = `Photo shared by ${review.name}`;
            photo.loading = 'lazy';
            photo.className = 'max-h-48 w-full rounded-lg object-cover';
            article.appendChild(photo);
        }

        const actions = document.createElement('div');
        actions.className = 'flex flex-wrap gap-2 items-center';
        const likeButton = document.createElement('button');
        likeButton.type = 'button';
        likeButton.className = 'text-xs text-indigo-700 hover:underline cursor-pointer';
        likeButton.textContent = `${review.likedByMe ? '♥ Liked' : '♡ Like'} (${review.likeCount || 0})`;
        likeButton.setAttribute('aria-pressed', String(Boolean(review.likedByMe)));
        const likeStatus = document.createElement('p');
        likeStatus.className = 'hidden text-xs';
        likeStatus.setAttribute('role', 'status');
        actions.appendChild(likeButton);
        likeButton.addEventListener('click', () => toggleReviewLike(reviewPlaceId, review.id, likeButton, likeStatus));
        actions.appendChild(likeStatus);
        if (isAdminAuthenticated()) {
            const visibilityButton = document.createElement('button');
            visibilityButton.type = 'button';
            visibilityButton.className = 'text-xs text-amber-700 hover:underline cursor-pointer';
            visibilityButton.textContent = review.hidden ? 'Restore review' : 'Hide review';
            visibilityButton.addEventListener('click', () => setReviewVisibility(reviewPlaceId, review.id, !review.hidden));
            actions.appendChild(visibilityButton);

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'text-xs text-rose-700 hover:underline cursor-pointer';
            deleteButton.textContent = 'Delete review';
            deleteButton.addEventListener('click', () => deleteReview(reviewPlaceId, review.id));
            actions.appendChild(deleteButton);
        }
        article.appendChild(actions);

        const replies = document.createElement('div');
        replies.className = 'ml-3 border-l-2 border-indigo-100 pl-3 space-y-2';
        for (const reply of review.replies || []) {
            const replyCard = document.createElement('div');
            replyCard.className = 'text-xs';
            const replyHeading = document.createElement('div');
            replyHeading.className = 'flex gap-2 items-center text-slate-500';
            const replyName = document.createElement('strong');
            replyName.className = 'text-slate-700';
            replyName.textContent = reply.name;
            replyHeading.appendChild(replyName);
            if (reply.adminReply) {
                const adminBadge = document.createElement('span');
                adminBadge.className = 'rounded bg-indigo-100 px-1.5 py-0.5 text-indigo-700';
                adminBadge.textContent = 'Admin';
                replyHeading.appendChild(adminBadge);
            }
            const replyDate = document.createElement('time');
            replyDate.className = 'text-slate-400';
            const replyCreatedAt = new Date(reply.createdAt);
            if (!Number.isNaN(replyCreatedAt.getTime())) {
                replyDate.dateTime = replyCreatedAt.toISOString();
                replyDate.textContent = replyCreatedAt.toLocaleDateString();
            }
            replyHeading.appendChild(replyDate);
            replyCard.appendChild(replyHeading);
            const replyText = document.createElement('p');
            replyText.className = 'mt-1 whitespace-pre-line break-words text-slate-700';
            replyText.textContent = reply.comment;
            replyCard.appendChild(replyText);
            replies.appendChild(replyCard);
        }

        const replyForm = document.createElement('form');
        replyForm.id = replyFormId;
        replyForm.className = 'review-reply-form mt-2 hidden space-y-2';
        const replyNameId = `${feedId}-reply-name-${review.id}`;
        if (!isAdminAuthenticated() && !visitorAccount) {
            const replyName = document.createElement('input');
            replyName.id = replyNameId;
            replyName.name = 'name';
            replyName.type = 'text';
            replyName.maxLength = 80;
            replyName.required = true;
            replyName.autocomplete = 'name';
            replyName.placeholder = 'Your name';
            replyName.setAttribute('aria-label', 'Your name for the reply');
            replyName.className = 'w-full rounded-lg border border-slate-200 p-2 text-xs focus:outline-indigo-500';
            replyForm.appendChild(replyName);
        }
        const replyInput = document.createElement('textarea');
        replyInput.name = 'comment';
        replyInput.rows = 2;
        replyInput.maxLength = 1500;
        replyInput.required = true;
        replyInput.placeholder = isAdminAuthenticated() ? 'Write an official reply...' : 'Write your reply...';
        replyInput.setAttribute('aria-label', replyInput.placeholder);
        replyInput.className = 'w-full rounded-lg border border-slate-200 p-2 text-xs focus:outline-indigo-500';
        replyForm.appendChild(replyInput);
        const replyButton = document.createElement('button');
        replyButton.type = 'submit';
        replyButton.className = 'rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer';
        replyButton.textContent = isAdminAuthenticated() ? 'Post as Admin' : 'Post reply';
        replyForm.appendChild(replyButton);
        const replyStatus = document.createElement('p');
        replyStatus.className = 'hidden text-xs';
        replyStatus.setAttribute('role', 'status');
        replyForm.appendChild(replyStatus);
        replyForm.addEventListener('submit', event => submitReviewReply(event, reviewPlaceId, review.id, replyStatus));
        showReplyFormButton.addEventListener('click', () => {
            const isOpening = replyForm.classList.contains('hidden');
            replyForm.classList.toggle('hidden', !isOpening);
            showReplyFormButton.setAttribute('aria-expanded', String(isOpening));
            if (isOpening) {
                replyForm.querySelector('input, textarea')?.focus();
            }
        });
        replies.appendChild(replyForm);
        article.appendChild(replies);
        feed.appendChild(article);
    }

    async function toggleReviewLike(placeId, reviewId, button, status) {
        button.disabled = true;
        try {
            const response = await fetch(`${API_BASE}/${placeId}/reviews/${reviewId}/likes`, {
                method: 'POST',
                headers: { 'X-Visitor-Id': getReviewVisitorId() }
            });
            if (!response.ok) {
                const message = await response.text();
                throw new Error(message || `Could not update like (HTTP ${response.status}).`);
            }
            await Promise.all([loadCommunityReviews(), loadReviewsForPlace(placeId)]);
        } catch (error) {
            button.disabled = false;
            status.textContent = error.message || 'Could not update like. Please try again.';
            status.className = 'text-xs text-rose-600';
            console.error('Could not update review like:', error);
        }
    }

    async function submitReviewReply(event, placeId, reviewId, status) {
        event.preventDefault();
        const form = event.currentTarget;
        const fields = new FormData(form);
        const headers = { 'Content-Type': 'application/json' };
        if (isAdminAuthenticated()) headers['X-Admin-Token'] = getAdminToken();
        else if (visitorAccount) headers['X-Visitor-Token'] = getVisitorToken();
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            const response = await fetch(`${API_BASE}/${placeId}/reviews/${reviewId}/replies`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: fields.get('name') || '',
                    comment: fields.get('comment')
                })
            });
            if (!response.ok) {
                const message = await response.text();
                throw new Error(message || `Could not save reply (HTTP ${response.status}).`);
            }
            await Promise.all([loadCommunityReviews(), loadReviewsForPlace(placeId)]);
        } catch (error) {
            status.textContent = error.message || 'Could not save the reply.';
            status.className = 'text-xs text-rose-600';
            console.error('Could not save review reply:', error);
        } finally {
            button.disabled = false;
        }
    }

    async function setReviewVisibility(placeId, reviewId, hidden) {
        const query = new URLSearchParams({ hidden: String(hidden) });
        const response = await fetch(`${API_BASE}/${placeId}/reviews/admin/${reviewId}/visibility?${query}`, {
            method: 'PATCH',
            headers: { 'X-Admin-Token': getAdminToken() }
        });
        if (!response.ok) {
            alert(`Could not ${hidden ? 'hide' : 'restore'} review (HTTP ${response.status}).`);
            return;
        }
        await Promise.all([loadCommunityReviews(), loadReviewsForPlace(placeId)]);
    }

    async function deleteReview(placeId, reviewId) {
        if (!confirm('Delete this review and its replies permanently?')) return;
        const response = await fetch(`${API_BASE}/${placeId}/reviews/admin/${reviewId}`, {
            method: 'DELETE',
            headers: { 'X-Admin-Token': getAdminToken() }
        });
        if (!response.ok) {
            alert(`Could not delete review (HTTP ${response.status}).`);
            return;
        }
        await Promise.all([loadCommunityReviews(), loadReviewsForPlace(placeId)]);
    }

    for (const commentText of place?.comments || []) {
        const comment = document.createElement('p');
        comment.className = 'bg-slate-50 p-2 rounded text-xs border border-slate-100 text-slate-700 whitespace-pre-line break-words';
        comment.textContent = commentText;
        feed.appendChild(comment);
    }

    if (loading && savedReviews.length === 0 && !(place?.comments?.length)) {
        const message = document.createElement('p');
        message.className = 'text-xs text-slate-400 italic';
        message.textContent = 'Loading community reviews...';
        feed.appendChild(message);
    } else if (!savedReviews.length && !(place?.comments?.length)) {
        const message = document.createElement('p');
        message.className = 'text-xs text-slate-400 italic';
        message.textContent = feedId === 'community-reviews-feed'
            ? 'No community reviews yet. Choose a place to share the first one.'
            : 'No reviews yet. Be the first to share your experience.';
        feed.appendChild(message);
    }
}

function setReviewFormStatus(message, isError = false) {
    const status = document.getElementById('review-form-status');
    status.textContent = message;
    status.classList.toggle('hidden', !message);
    status.classList.toggle('text-rose-600', isError);
    status.classList.toggle('text-emerald-700', !isError);
}

async function submitReview(event) {
    event.preventDefault();
    if (!activePlaceId) return;

    const placeId = activePlaceId;
    const form = document.getElementById('review-form');
    const photo = document.getElementById('review-photo').files[0];
    if (photo && photo.size > 5 * 1024 * 1024) {
        setReviewFormStatus('Photo must be 5 MB or smaller.', true);
        return;
    }
    if (photo && !['image/jpeg', 'image/png'].includes(photo.type)) {
        setReviewFormStatus('Choose a JPEG or PNG photo.', true);
        return;
    }

    const submitButton = document.getElementById('review-submit');
    submitButton.disabled = true;
    submitButton.textContent = 'Saving...';
    setReviewFormStatus('');
    try {
        const formData = new FormData(form);
        if (visitorAccount) formData.delete('name');
        if (selectedRating) formData.set('rating', String(selectedRating));
        const response = await fetch(`${API_BASE}/${placeId}/reviews`, {
            method: 'POST',
            headers: { 'X-Visitor-Token': getVisitorToken() },
            body: formData
        });
        if (!response.ok) {
            const errorMessage = await response.text();
            throw new Error(errorMessage || `Could not save review (HTTP ${response.status}).`);
        }
        form.reset();
        if (activePlaceId === placeId) {
            selectedRating = 0;
            updateRatingControls();
            const place = places.find(item => item.id === placeId);
            setReviewFormStatus(`Your review for ${place?.name || 'this place'} was saved. Thank you!`);
        } else {
            setReviewFormStatus('Your review was saved. Thank you!');
        }
        if (activePlaceId === placeId) {
            await Promise.all([loadCommunityReviews(), loadReviewsForPlace(placeId)]);
        }
        await loadPlaces();
    } catch (error) {
        setReviewFormStatus(error.message || 'Could not save your review. Please try again.', true);
        console.error('Could not save review:', error);
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Save Review';
    }
}

function showPlaceOnMap(id, scrollToMap = false) {
    const place = places.find(item => item.id === id);
    const coordinates = place ? getCoordinatesFromMapUrl(place.mapUrl) : null;
    const status = document.getElementById('map-status');
    const marker = placeMarkersById.get(id);

    if (!place || !coordinates || !marker || !placesMap) {
        if (status) {
            status.textContent = place && !coordinates
                ? `${place.name} has no coordinates in its Google Maps URL yet. Add a full Google Maps URL containing coordinates to show its exact location.`
                : 'This place is not visible on the map with the current city filter.';
        }
        return;
    }

    status.textContent = `Showing the exact location for ${place.name}.`;
    placesMap.setView(coordinates, 17, { animate: true });
    marker.openPopup();
    if (scrollToMap) document.getElementById('places-map').scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => placesMap.invalidateSize(), 0);
}

async function submitRating() {
    if (!activePlaceId || !selectedRating || ratingSubmitting) return;

    const placeId = activePlaceId;
    const stars = selectedRating;
    const place = places.find(item => item.id === placeId);
    const status = document.getElementById('rating-status');
    let successMessage = '';
    ratingSubmitting = true;
    updateRatingControls();
    try {
        const response = await fetch(`${API_BASE}/${placeId}/rate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(stars)
        });
        if (!response.ok) {
            const errorMessage = await response.text();
            throw new Error(errorMessage || `Could not save rating (HTTP ${response.status}).`);
        }
        if (activePlaceId === placeId) {
            selectedRating = 0;
            await loadPlaces();
            successMessage = `Your ${stars}-star rating for ${place?.name || 'this place'} was saved.`;
        } else {
            await loadPlaces();
        }
    } catch (error) {
        if (activePlaceId === placeId) {
            status.textContent = error.message || 'Could not save your rating. Please try again.';
            status.classList.remove('text-slate-500', 'text-emerald-700');
            status.classList.add('text-rose-600');
        }
        console.error('Could not save rating:', error);
    } finally {
        ratingSubmitting = false;
        updateRatingControls();
        if (successMessage && activePlaceId === placeId) {
            status.textContent = successMessage;
            status.classList.remove('text-slate-500', 'text-rose-600');
            status.classList.add('text-emerald-700');
        }
    }
}

async function savePlace(e) {
    e.preventDefault();
    const id = document.getElementById('edit-place-id').value;
    const status = document.getElementById('place-form-status');
    const submitButton = document.querySelector('#place-form button[type="submit"]');
    const payload = {
        name: document.getElementById('form-name').value,
        city: document.getElementById('form-city').value,
        photoUrl: document.getElementById('form-photo').value,
        photoCredit: document.getElementById('form-photo-credit').value,
        photoSourceUrl: document.getElementById('form-photo-source').value,
        mapUrl: document.getElementById('form-map-url').value,
        description: document.getElementById('form-desc').value
    };

    const url = id ? `${API_BASE}/admin/edit/${id}` : `${API_BASE}/admin/add`;
    submitButton.disabled = true;
    submitButton.textContent = id ? 'Updating…' : 'Saving…';
    status.classList.add('hidden');
    try {
        const response = await fetch(url, {
            method: id ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Token': getAdminToken()
            },
            body: JSON.stringify(payload)
        });

        if (response.status === 401) {
            status.textContent = 'Your login session expired. Please log in again.';
            status.className = 'text-xs text-rose-600';
            logoutAdmin();
            return;
        }
        if (!response.ok) {
            const message = await response.text();
            throw new Error(message || `Could not save place (HTTP ${response.status}).`);
        }
        const successMessage = id ? 'Place updated successfully.' : 'Place added successfully.';
        await loadPlaces();
        cancelAdminEdit();
        status.textContent = successMessage;
        status.className = 'text-xs text-emerald-700';
        status.classList.remove('hidden');
    } catch (error) {
        status.textContent = error.message || 'Could not save the place. Please try again.';
        status.className = 'text-xs text-rose-600';
        status.classList.remove('hidden');
        console.error('Could not save place:', error);
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = document.getElementById('edit-place-id').value ? 'Update Place' : 'Save Place';
    }
}

function setupEdit(id) {
    const p = places.find(p => p.id === id);
    if (!p) return;
    document.getElementById('edit-place-id').value = p.id;
    document.getElementById('form-name').value = p.name;
    document.getElementById('form-city').value = p.city;
    document.getElementById('form-photo').value = p.photoUrl || '';
    document.getElementById('form-photo-credit').value = p.photoCredit || '';
    document.getElementById('form-photo-source').value = p.photoSourceUrl || '';
    document.getElementById('form-map-url').value = p.mapUrl || '';
    document.getElementById('form-desc').value = p.description;
    document.getElementById('admin-panel-title').innerText = `Edit ${p.name}`;
    document.querySelector('#place-form button[type="submit"]').textContent = 'Update Place';
    document.getElementById('place-form-status').classList.add('hidden');
    document.getElementById('admin-management-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelAdminEdit() {
    document.getElementById('place-form').reset();
    document.getElementById('edit-place-id').value = '';
    document.getElementById('admin-panel-title').innerText = "Add New Place";
    document.querySelector('#place-form button[type="submit"]').textContent = 'Save Place';
    document.getElementById('place-form-status').classList.add('hidden');
}

async function deletePlace(id) {
    const place = places.find(item => item.id === id);
    if (confirm(`Remove ${place?.name || 'this place'} and all of its reviews and replies? This cannot be undone.`)) {
        try {
            const response = await fetch(`${API_BASE}/admin/delete/${id}`, {
            method: 'DELETE',
            headers: { 'X-Admin-Token': getAdminToken() }
            });
            if (response.status === 401) {
                alert("Your login session expired. Please log in again.");
                logoutAdmin();
                return;
            }
            if (!response.ok) throw new Error(`Could not remove place (HTTP ${response.status}).`);
            if (activePlaceId === id) {
                activePlaceId = null;
                closePlaceDetails(false);
            }
            await loadPlaces();
        } catch (error) {
            alert(error.message || 'Could not remove this place. Please try again.');
            console.error('Could not remove place:', error);
        }
    }
}

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !document.getElementById('login-modal').classList.contains('hidden')) {
        closeLoginModal();
    } else if (event.key === 'Escape' && document.getElementById('active-place-details').classList.contains('mobile-open')) {
        closePlaceDetails();
    }
});

window.addEventListener('resize', () => {
    const details = document.getElementById('active-place-details');
    if (!details.classList.contains('hidden')) {
        setPlaceDetailsSheet(details.classList.contains('mobile-open'));
    }
});

updateUIVisibility();
restoreVisitorSession().finally(loadPlaces);