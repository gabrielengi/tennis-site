import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css'; // Your global CSS
import { Amplify } from 'aws-amplify'; // Import Amplify
import outputs from '../amplify_outputs.json'; // Import your Amplify outputs
import { Authenticator } from '@aws-amplify/ui-react'; // Import Authenticator for its Provider

// Configure Amplify with your backend outputs
Amplify.configure(outputs);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Wrap the App component with Authenticator.Provider */}
    <Authenticator.Provider>
      <App />
    </Authenticator.Provider>
  </React.StrictMode>,
);
