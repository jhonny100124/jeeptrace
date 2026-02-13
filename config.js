// Load environment variables
const config = {
    apiKey: 'AIzaSyBwUSE4gG0Y-Ds_7D_oticWeGHxOsfgH-4q',
    latitude: 9.84773,
    longitude: 122.88723,
    markerColor: 'red'
};

// Create embed URL dynamically with marker
function getMapEmbedUrl() {
    // Create marker with red pin
    const marker = `!1m18!1m12!1m3!1d3953.8218907380726!2d${config.longitude}!3d${config.latitude}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x33f08b8b8b8b8b8b%3A0x8b8b8b8b8b8b8b8b!2sJeep%20Location!5e0!3m2!1sen!2sph!4v1612345678901`;
    return `https://www.google.com/maps/embed?pb=${marker}`;
}
