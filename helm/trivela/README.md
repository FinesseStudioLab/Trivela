# Trivela Helm Chart

Deploy the full Trivela stack (backend API + nginx frontend + autoscaling) to any Kubernetes cluster
using this Helm chart.

## Prerequisites

- Kubernetes ≥ 1.23
- Helm ≥ 3.10
- [cert-manager](https://cert-manager.io/) installed (for automatic TLS)
- [ingress-nginx](https://kubernetes.github.io/ingress-nginx/) installed

## Quick Start

```bash
# 1. Add any chart dependencies (none currently)
helm dependency update helm/trivela

# 2. Install with default values (review values.yaml first!)
helm install trivela ./helm/trivela \
  --set secrets.databaseUrl="postgresql://user:pass@host:5432/trivela_db" \
  --set secrets.jwtSecret="your-super-secret-32-char-minimum" \
  --set ingress.host="trivela.yourdomain.com"

# 3. Upgrade
helm upgrade trivela ./helm/trivela -f my-production-values.yaml

# 4. Uninstall
helm uninstall trivela
```

## Configuration

All configurable values are in [values.yaml](values.yaml). Key overrides:

| Key                                          | Default               | Description                  |
| -------------------------------------------- | --------------------- | ---------------------------- |
| `backend.replicaCount`                       | `2`                   | Initial backend pod count    |
| `backend.image.repository`                   | `trivela-backend`     | Backend image                |
| `backend.image.tag`                          | `latest`              | Backend image tag            |
| `frontend.replicaCount`                      | `2`                   | Initial frontend pod count   |
| `ingress.host`                               | `trivela.example.com` | Public hostname              |
| `ingress.tls.enabled`                        | `true`                | Enable TLS via cert-manager  |
| `autoscaling.minReplicas`                    | `2`                   | HPA minimum replicas         |
| `autoscaling.maxReplicas`                    | `10`                  | HPA maximum replicas         |
| `autoscaling.targetCPUUtilizationPercentage` | `70`                  | CPU threshold for scale-out  |
| `secrets.databaseUrl`                        | _(placeholder)_       | PostgreSQL connection string |
| `secrets.jwtSecret`                          | _(placeholder)_       | JWT signing secret           |

## Secrets Management

**Never commit real secrets to version control.**  
Use one of the following patterns for production:

```bash
# Option A – pass at install time
helm install trivela ./helm/trivela --set secrets.databaseUrl="postgresql://..."

# Option B – use an external secrets manager (e.g. External Secrets Operator)
# and override the secret.yaml template accordingly.
```

## Autoscaling

HPA is enabled by default. The backend scales between 2 and 10 replicas based on CPU (70%) and
memory (80%) utilisation. Adjust via:

```bash
helm upgrade trivela ./helm/trivela \
  --set autoscaling.maxReplicas=20 \
  --set autoscaling.targetCPUUtilizationPercentage=60
```
