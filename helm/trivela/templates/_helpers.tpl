{{/*
Expand the name of the chart.
*/}}
{{- define "trivela.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "trivela.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- printf "%s" $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "trivela.labels" -}}
helm.sh/chart: {{ include "trivela.name" . }}-{{ .Chart.Version | replace "+" "_" }}
{{ include "trivela.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "trivela.selectorLabels" -}}
app.kubernetes.io/name: {{ include "trivela.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
