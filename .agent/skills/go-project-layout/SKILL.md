---
name: go-project-layout
description: Guidelines for the standard Go project layout used in OmniHive.
---

# Go Project Layout for OmniHive

This project follows the Standard Go Project Layout.

## Directories

- `cmd/`: Main applications for this project. The directory name for each application should match the name of the executable you want to have (e.g., `cmd/master/main.go`).
- `internal/`: Private application and library code. This is code that you don't want others importing in their applications or libraries.
- `web/`: Frontend specific components (Vue3, Quasar).
- `configs/`: Configuration file templates or default configs.
- `deployments/`: IaaS, PaaS, system and container orchestration deployment configurations and templates (Dockerfiles, docker-compose).

## Rules
- Do not place `main.go` in the root directory.
- Keep `main.go` files small. Their primary responsibility is to parse configurations and wire up dependencies.
- Business logic should be placed in `internal/`.
