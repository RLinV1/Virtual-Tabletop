# Spec Delta

## MODIFIED Requirements

### Requirement: One entry rule for the dashboard
A browser SHALL be *recognised* when it holds a GM identity or has previously chosen to continue as a guest. Every way into a GM surface, meaning the GM dashboard and the asset library, SHALL apply the same rule: a recognised browser SHALL reach the surface directly, and any other browser SHALL be taken to the sign-in page first, which then leads to the dashboard. This applies to the home page's link, to other links into those surfaces, and to opening `/gm-dashboard` or `/library` directly. The home page SHALL NOT link to the asset library; the GM dashboard is its way in.

#### Scenario: First-time GM from the home page
- **WHEN** a browser with no GM identity and no guest choice follows the home page's "Set up a room" link
- **THEN** the sign-in page opens, and continuing as a guest from it opens the dashboard

#### Scenario: Direct visit behaves the same
- **WHEN** a browser with no GM identity and no guest choice opens `/gm-dashboard` directly
- **THEN** it is taken to the sign-in page, exactly as if it had followed the home page's link

#### Scenario: Recognised browser goes straight in
- **WHEN** a browser that holds a GM identity, or that chose to continue as a guest before, follows the home page's link or opens `/gm-dashboard`
- **THEN** the dashboard opens with no sign-in step

#### Scenario: Back does not loop
- **WHEN** a browser is taken from the dashboard URL to the sign-in page and the user presses Back
- **THEN** they return to the page they came from, not to a redirect that sends them to sign-in again

#### Scenario: Direct visit to the library
- **WHEN** a browser with no GM identity and no guest choice opens `/library` directly
- **THEN** it is taken to the sign-in page, and pressing Back returns it to the page it came from rather than to the library redirect

#### Scenario: Recognised browser opens the library
- **WHEN** a recognised browser opens `/library`, directly or from the dashboard's library link
- **THEN** the library opens with no sign-in step

#### Scenario: No library link on the home page
- **WHEN** a visitor reads the home page
- **THEN** no link or button opens the asset library, and the library section says it is found on the GM dashboard
