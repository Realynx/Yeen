#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <media-file>" >&2
  exit 2
fi

media_path=$1

run_timed() {
  local label=$1
  shift
  echo "--- ${label} ---"
  /usr/bin/time -f 'elapsed=%e cpu=%P maxrss=%MKB' "$@"
}

run_timed nfs-read-remux-60s \
  ffmpeg -nostdin -hide_banner -loglevel error \
  -ss 900 -i "$media_path" -t 60 -map 0:v:0 -c copy -f null -

run_timed current-cpu-pipeline-3s \
  ffmpeg -nostdin -hide_banner -loglevel error \
  -ss 900 -i "$media_path" -t 3 \
  -fflags +genpts+discardcorrupt -err_detect ignore_err -ignore_unknown \
  -map 0:v:0 -map '0:a:0?' -sn -dn \
  -c:v libx264 \
  -vf 'setpts=PTS-STARTPTS,scale=-2:1440:force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p' \
  -pix_fmt yuv420p -profile:v high -vsync cfr \
  -g 72 -keyint_min 72 -sc_threshold 0 \
  -force_key_frames 'expr:eq(n,0)' \
  -preset medium -crf 25 -maxrate 10000k -bufsize 30000k \
  -c:a aac -ac 2 -ar 48000 \
  -af 'asetpts=PTS-STARTPTS,aresample=async=1:first_pts=0' -b:a 96k \
  -f null -

run_timed current-cpu-pipeline-12s \
  ffmpeg -nostdin -hide_banner -loglevel error \
  -ss 900 -i "$media_path" -t 12 \
  -fflags +genpts+discardcorrupt -err_detect ignore_err -ignore_unknown \
  -map 0:v:0 -map '0:a:0?' -sn -dn \
  -c:v libx264 \
  -vf 'setpts=PTS-STARTPTS,scale=-2:1440:force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p' \
  -pix_fmt yuv420p -profile:v high -vsync cfr \
  -g 72 -keyint_min 72 -sc_threshold 0 \
  -force_key_frames 'expr:eq(n,0)' \
  -preset medium -crf 25 -maxrate 10000k -bufsize 30000k \
  -c:a aac -ac 2 -ar 48000 \
  -af 'asetpts=PTS-STARTPTS,aresample=async=1:first_pts=0' -b:a 96k \
  -f null -

run_timed nvenc-cpu-scale-pipeline-3s \
  ffmpeg -nostdin -hide_banner -loglevel error \
  -ss 900 -i "$media_path" -t 3 \
  -fflags +genpts+discardcorrupt -err_detect ignore_err -ignore_unknown \
  -map 0:v:0 -map '0:a:0?' -sn -dn \
  -c:v h264_nvenc \
  -vf 'setpts=PTS-STARTPTS,scale=-2:1440:force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p' \
  -pix_fmt yuv420p -profile:v high -vsync cfr \
  -g 72 -keyint_min 72 -sc_threshold 0 \
  -force_key_frames 'expr:eq(n,0)' \
  -preset p4 -tune hq -rc vbr -cq 25 \
  -maxrate 10000k -bufsize 30000k -spatial_aq 1 -temporal_aq 1 \
  -c:a aac -ac 2 -ar 48000 \
  -af 'asetpts=PTS-STARTPTS,aresample=async=1:first_pts=0' -b:a 96k \
  -f null -

run_timed nvenc-cuda-scale-pipeline-3s \
  ffmpeg -nostdin -hide_banner -loglevel error \
  -hwaccel cuda -hwaccel_output_format cuda \
  -ss 900 -i "$media_path" -t 3 \
  -fflags +genpts+discardcorrupt -err_detect ignore_err -ignore_unknown \
  -map 0:v:0 -map '0:a:0?' -sn -dn \
  -c:v h264_nvenc \
  -vf 'setpts=PTS-STARTPTS,scale_cuda=-2:1440:force_original_aspect_ratio=decrease:force_divisible_by=2,hwdownload,format=p010le,format=yuv420p' \
  -pix_fmt yuv420p -profile:v high -vsync cfr \
  -g 72 -keyint_min 72 -sc_threshold 0 \
  -force_key_frames 'expr:eq(n,0)' \
  -preset p4 -tune hq -rc vbr -cq 25 \
  -maxrate 10000k -bufsize 30000k -spatial_aq 1 -temporal_aq 1 \
  -c:a aac -ac 2 -ar 48000 \
  -af 'asetpts=PTS-STARTPTS,aresample=async=1:first_pts=0' -b:a 96k \
  -f null -
