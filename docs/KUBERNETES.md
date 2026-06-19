# Kubernetes Deployment Guide

This document covers deploying Trivela to a Kubernetes cluster using either the raw manifests in
`k8s/` or the Helm chart in `helm/trivela/`.

---

## Architecture Overview

```
Internet
   │
   ▼
┌──────────────────────────────────┐
│        NGINX Ingress             │  (TLS termination via cert-manager)
└─────────────┬────────────────────┘
              │
    ┌─────────┴──────────┐
    │                    │
    ▼                    ▼
┌─────────┐        ┌──────────┐
│ Frontend│        │ Backend  │  ← HPA (min 2, max 10 replicas, CPU 70%)
│ (nginx) │        │ (Node.js)│
└─────────┘        └────┬─────┘
                        │
                   ┌────▼─────┐
                   │PostgreSQL│
                   └──────────┘
```

---

## Option A – Raw Kubernetes Manifests (`k8s/`)

### Prerequisites

- `kubectl` configured against your cluster
- cert-manager installed:
  `kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml`
- ingress-nginx installed:
  `kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.0/deploy/static/provider/cloud/deploy.yaml`

### 1. Configure Secrets

Edit `k8s/secret.yaml` and replace the placeholder values:

```bash
# Or supply values directly:
kubectl create secret generic trivela-secrets \
  --from-literal=DATABASE_URL="postgresql://user:pass@host:5432/trivela_db" \
  --from-literal=JWT_SECRET="your-strong-secret-here" \
  --from-literal=SOROBAN_RPC_URL="https://soroban-testnet.stellar.org"
```

> ⚠️ **Never commit real secrets.** The `k8s/secret.yaml` file contains placeholders only.

### 2. Deploy All Resources

```bash
# Apply in dependency order
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/deployment-backend.yaml
kubectl apply -f k8s/deployment-frontend.yaml
kubectl apply -f k8s/service-backend.yaml
kubectl apply -f k8s/service-frontend.yaml
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/ingress.yaml

# Or apply the entire directory at once:
kubectl apply -f k8s/
```

### 3. Verify Rollout

```bash
kubectl rollout status deployment/trivela-backend
kubectl rollout status deployment/trivela-frontend
kubectl get pods -l app=trivela
kubectl get ingress trivela-ingress
```

---

## Option B – Helm Chart (`helm/trivela/`)

See [helm/trivela/README.md](../helm/trivela/README.md) for full Helm instructions.

```bash
helm install trivela ./helm/trivela \
  --set secrets.databaseUrl="postgresql://user:pass@host:5432/trivela_db" \
  --set secrets.jwtSecret="your-strong-secret" \
  --set ingress.host="trivela.yourdomain.com"
```

---

## Files Reference

| File                           | Purpose                                                    |
| ------------------------------ | ---------------------------------------------------------- |
| `k8s/deployment-backend.yaml`  | Backend Deployment (2 replicas, liveness/readiness probes) |
| `k8s/deployment-frontend.yaml` | Frontend Deployment served by nginx                        |
| `k8s/service-backend.yaml`     | ClusterIP Service for backend on port 3001                 |
| `k8s/service-frontend.yaml`    | ClusterIP or LoadBalancer Service for frontend on port 80  |
| `k8s/ingress.yaml`             | NGINX Ingress with TLS (cert-manager annotation)           |
| `k8s/configmap.yaml`           | Non-secret environment variables + nginx config            |
| `k8s/secret.yaml`              | Secret template (values NOT committed)                     |
| `k8s/hpa.yaml`                 | HorizontalPodAutoscaler (min 2 / max 10 replicas, CPU 70%) |

---

## Scaling

The HPA automatically scales the backend between **2 and 10 replicas** based on CPU utilisation
(threshold: 70%).

To manually scale:

```bash
kubectl scale deployment trivela-backend --replicas=5
```

---

## Rolling Updates

```bash
# Update backend image tag
kubectl set image deployment/trivela-backend backend=trivela-backend:v1.2.0

# Watch rollout
kubectl rollout status deployment/trivela-backend

# Roll back if needed
kubectl rollout undo deployment/trivela-backend
```

---

## Troubleshooting

```bash
# View pod logs
kubectl logs -l app=trivela,component=backend --tail=100

# Describe a pod for events
kubectl describe pod -l app=trivela,component=backend

# Check HPA status
kubectl get hpa trivela-backend-hpa

# Port-forward backend locally for debugging
kubectl port-forward svc/trivela-backend 3001:3001
```
