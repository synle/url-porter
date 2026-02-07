import { useState, useEffect } from "react";
import "./newtab.scss";

export default function NewTab() {
  const [isLoading, setIsLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    redirectToHomepage();
  }, []);

  const redirectToHomepage = async () => {
    const url = await getHomepageUrl();

    if (url) {
      chrome.tabs.getCurrent(function (tab) {
        chrome.tabs.update(tab.id, {
          url: url,
          highlighted: true,
        });
      });
    } else {
      setIsLoading(false);
      setShowContent(true);
    }
  };

  if (isLoading || !showContent) {
    return null;
  }

  return (
    <div className="newtab-container">
      <div className="newtab-content">
        <div className="logo-section">
          <h1>URL Porter</h1>
          <p className="subtitle">Custom Homepage & URL Redirects</p>
        </div>

        <div className="card">
          <h2>Welcome!</h2>
          <p>
            No homepage URL is configured yet. Set up your custom homepage and
            redirect rules in the options page.
          </p>
          <a href="../options/options.html" className="button">
            Open Settings
          </a>
        </div>

        <div className="features">
          <div className="feature-item">
            <span className="feature-icon">🏠</span>
            <h3>Custom Homepage</h3>
            <p>Set any URL as your new tab page</p>
          </div>
          <div className="feature-item">
            <span className="feature-icon">🔀</span>
            <h3>URL Redirects</h3>
            <p>Create custom redirect rules</p>
          </div>
          <div className="feature-item">
            <span className="feature-icon">⚡</span>
            <h3>Fast & Simple</h3>
            <p>Lightweight and easy to use</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function getHomepageUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get("homepageUrl", (result) => {
      resolve(result.homepageUrl || "");
    });
  });
}
