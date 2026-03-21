/**
 * New Tab override page.
 *
 * If a homepage URL is configured, immediately redirects the tab there.
 * Otherwise shows a welcome screen with feature highlights and links
 * to the settings and add-link pages.
 */

import { useState, useEffect } from "react";
import { Container, Typography, Card, CardContent, Button, Grid, Box } from "@mui/material";
import HomeIcon from "@mui/icons-material/Home";
import ShuffleIcon from "@mui/icons-material/Shuffle";
import BoltIcon from "@mui/icons-material/Bolt";
import SettingsIcon from "@mui/icons-material/Settings";
import AddLinkIcon from "@mui/icons-material/AddLink";
import { ThemeContextProvider } from "../../theme.jsx";
import { getHomepageUrl } from "../../helpers/storage.js";

/** React component that handles new tab redirection or displays a welcome screen. */
function NewTabContent() {
  const [isLoading, setIsLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    redirectToHomepage();
  }, []);

  /**
   * Redirects the current tab to the configured homepage URL, or shows fallback content.
   * @returns {Promise<void>}
   */
  const redirectToHomepage = async () => {
    const url = await getHomepageUrl();

    if (url) {
      // Find the current tab and navigate it to the homepage URL
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          chrome.tabs.update(tab.id, { url, highlighted: true });
        }
      } catch {
        // Fallback: update whichever tab we're on without specifying ID
        chrome.tabs.update({ url });
      }
    } else {
      setIsLoading(false);
      setShowContent(true);
    }
  };

  if (isLoading || !showContent) {
    return null;
  }

  const features = [
    {
      icon: <HomeIcon sx={{ fontSize: 40 }} color="primary" />,
      title: "Custom Homepage",
      description: "Set any URL as your new tab page",
    },
    {
      icon: <ShuffleIcon sx={{ fontSize: 40 }} color="primary" />,
      title: "URL Redirects",
      description: "Create custom redirect rules",
    },
    {
      icon: <BoltIcon sx={{ fontSize: 40 }} color="primary" />,
      title: "Fast & Simple",
      description: "Lightweight and easy to use",
    },
  ];

  return (
    <Container maxWidth="md" sx={{ py: 8 }}>
      <Box textAlign="center" mb={6}>
        <Typography variant="h2" fontWeight="bold" gutterBottom>
          URL Porter
        </Typography>
        <Typography variant="h6" color="text.secondary">
          Custom Homepage & URL Redirects
        </Typography>
      </Box>

      <Card sx={{ mb: 6, textAlign: "center" }}>
        <CardContent sx={{ py: 4, px: 3 }}>
          <Typography variant="h5" gutterBottom>
            Welcome!
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            No homepage URL is configured yet. Set up your custom homepage and redirect rules in the options page.
          </Typography>
          <Box display="flex" gap={2} justifyContent="center">
            <Button variant="contained" size="large" startIcon={<SettingsIcon />} href="../options/options.html">
              Open Settings
            </Button>
            <Button variant="outlined" size="large" startIcon={<AddLinkIcon />} href="../addlink/addlink.html">
              Add Link
            </Button>
          </Box>
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        {features.map((feature) => (
          <Grid size={{ xs: 12, md: 4 }} key={feature.title}>
            <Card sx={{ textAlign: "center", height: "100%" }}>
              <CardContent sx={{ py: 4 }}>
                {feature.icon}
                <Typography variant="h6" sx={{ mt: 2 }} gutterBottom>
                  {feature.title}
                </Typography>
                <Typography color="text.secondary">{feature.description}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Container>
  );
}

/** Exported New Tab page wrapper with theme provider. */
export default function NewTab() {
  return (
    <ThemeContextProvider>
      <NewTabContent />
    </ThemeContextProvider>
  );
}
