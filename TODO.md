# Vivid IDE - TODO

## Release Setup

### GitHub Secrets (required for CI/CD releases)

Add these secrets in GitHub repo settings → Secrets and variables → Actions:

**macOS Code Signing:**
- [ ] `APPLE_CERTIFICATE` - Base64-encoded .p12 certificate
- [ ] `APPLE_CERTIFICATE_PASSWORD` - Password for the .p12 file
- [ ] `APPLE_SIGNING_IDENTITY` - e.g., "Developer ID Application: Your Name (TEAM_ID)"
- [ ] `APPLE_ID` - Apple ID email for notarization
- [ ] `APPLE_PASSWORD` - App-specific password for notarization
- [ ] `APPLE_TEAM_ID` - Your Apple Developer Team ID

**To generate APPLE_CERTIFICATE:**
```bash
# Export from Keychain Access as .p12, then:
base64 -i certificate.p12 | pbcopy
# Paste into GitHub secret
```

### First Release
- [ ] Set up GitHub secrets above
- [ ] Create and push tag: `git tag v0.1.0 && git push origin v0.1.0`
- [ ] Verify release workflow runs successfully

---

## Features

### Node Graph Enhancements
- [ ] Display operator texture previews via `egui::Image::from_texture`
- [ ] Implement pan/zoom (provided by egui_node_graph2)
- [ ] Port mini-map from current NodeGraph implementation

### Parameter Types
- [ ] String parameter support (text input)
- [ ] FilePath parameter support (file browser dialog)

### Testing/Validation
- [ ] Ensure texture formats match between Tauri and vivid-core
- [ ] Test: Tauri creates device, passes to vivid-core, renders

---

## Nice to Have
- [ ] Auto-update support (Tauri updater plugin)
- [ ] Windows code signing
- [ ] Linux .deb/.rpm packages
