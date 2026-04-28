import axios from 'axios';

// In production builds, the frontend is served by Nginx on the same origin
// as the API (Nginx proxies /api/* to the Node backend), so a relative URL
// works. In dev (Vite on :5173, backend on :5001), use the absolute URL.
const instance = axios.create({
  baseURL: import.meta.env.PROD ? '/api' : 'http://localhost:5001/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor: Add JWT token to every request
instance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('exam_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor: Handle 401 errors and redirect to login
instance.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear tokens from localStorage
      localStorage.removeItem('exam_token');
      localStorage.removeItem('exam_user');
      
      // Redirect to login
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default instance;
