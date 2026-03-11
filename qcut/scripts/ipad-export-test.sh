#!/bin/bash
# iPad Simulator Export E2E Test Suite
# Tests different media types and export configurations on a real iPad simulator.
#
# Usage:
#   ./scripts/ipad-export-test.sh              # Run all tests
#   ./scripts/ipad-export-test.sh text         # Run only text export test
#   ./scripts/ipad-export-test.sh image        # Run only image export test
#   ./scripts/ipad-export-test.sh video        # Run only video export test
#   ./scripts/ipad-export-test.sh mixed        # Run only mixed media test
#   ./scripts/ipad-export-test.sh formats      # Run format matrix tests

set -uo pipefail

BUNDLE_ID="com.qcut.videoeditor"
PASS=0
FAIL=0
ERRORS=""

# ── Helpers ──────────────────────────────────────────────────────────────────

log()  { echo "  $*"; }
info() { echo "ℹ️  $*"; }
ok()   { echo "✅ $*"; PASS=$((PASS + 1)); }
fail() { echo "❌ $*"; FAIL=$((FAIL + 1)); ERRORS="${ERRORS}  - $*"$'\n'; }
hr()   { echo "────────────────────────────────────────────────────────"; }

# Send a deep link
cli_cmd() {
    xcrun simctl openurl booted "qcut://$1" 2>/dev/null || true
}

# Get QCut CLI result from logs
cli_result() {
    local wait_sec="${1:-2}"
    local log_window="${2:-5}"
    sleep "$wait_sec"
    xcrun simctl spawn booted log show \
        --predicate 'eventMessage CONTAINS "QCut CLI"' \
        --last "${log_window}s" --style compact 2>&1 \
        | grep "Result" | tail -1 | sed 's/.*Result: //'
}

# Run JS in webview — writes JS to temp file, URL-encodes, evals via deep link
run_js() {
    local js="$1"
    local tmpfile="/tmp/qcut_eval_$$.js"
    printf '%s' "$js" > "$tmpfile"
    local encoded
    encoded=$(python3 -c "
import urllib.parse
with open('$tmpfile') as f:
    print(urllib.parse.quote(f.read()))
")
    rm -f "$tmpfile"

    # Check URL length — xcrun simctl openurl has a practical limit
    if [ "${#encoded}" -gt 4000 ]; then
        echo "ERROR:url_too_long(${#encoded})"
        return 1
    fi

    cli_cmd "eval?js=$encoded"
    cli_result 2 5
}

# Run JS that may be long — splits into setup + exec if needed
run_js_long() {
    local setup_js="$1"
    local exec_js="$2"
    # Run setup (small) then exec (small), both under URL limit
    if [ -n "$setup_js" ]; then
        run_js "$setup_js" > /dev/null
    fi
    run_js "$exec_js"
}

# Wait for export to complete, max timeout in seconds
wait_export() {
    local max_wait="${1:-120}"
    local elapsed=0
    local interval=4
    while [ "$elapsed" -lt "$max_wait" ]; do
        sleep "$interval"
        elapsed=$((elapsed + interval))
        cli_cmd "export-status"
        local status
        status=$(cli_result 2 5)

        # Parse progress for display
        local progress_display
        progress_display=$(echo "$status" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    print(f'progress={d[\"progress\"]:.0f}% status={d[\"status\"]}')
except:
    print('(parsing...)')
" 2>/dev/null)
        log "  [${elapsed}/${max_wait}s] $progress_display"

        if echo "$status" | grep -q '"isExporting":false'; then
            if echo "$status" | grep -qi '"status":"Export completed"'; then
                echo "completed"
                return 0
            fi
            local prog_num
            prog_num=$(echo "$status" | python3 -c "import sys,json; print(int(json.load(sys.stdin).get('progress',0)))" 2>/dev/null || echo "0")
            if [ "$prog_num" -ge 100 ] 2>/dev/null; then
                echo "completed (progress=$prog_num)"
                return 0
            fi
            local err_status
            err_status=$(echo "$status" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null || echo "unknown")
            echo "failed: $err_status"
            return 1
        fi
    done
    echo "timeout after ${max_wait}s"
    return 1
}

# Clear timeline
reset_project() {
    log "Resetting timeline..."
    run_js "(function(){var tl=window.__timelineStore;if(tl)tl.getState().clearTimeline();return 'ok'})()" > /dev/null
    sleep 1
}

# Create a synthetic image in-browser using Canvas, add to media store
# Returns media ID on stdout
create_synthetic_image() {
    local name="${1:-test-image.png}"
    local color="${2:-ff6600}"

    # Create image async via toBlob
    run_js "(function(){try{var c=document.createElement('canvas');c.width=640;c.height=480;var x=c.getContext('2d');x.fillStyle='#${color}';x.fillRect(0,0,640,480);x.fillStyle='#fff';x.font='bold 48px Arial';x.textAlign='center';x.fillText('TEST IMAGE',320,240);c.toBlob(function(b){var f=new File([b],'${name}',{type:'image/png'});var u=URL.createObjectURL(b);var ms=window.__mediaStore;if(!ms)return;var id='img_'+Date.now();ms.setState({mediaItems:ms.getState().mediaItems.concat([{id:id,name:'${name}',type:'image',file:f,url:u,thumbnailUrl:u,thumbnailStatus:'ready',duration:5,width:640,height:480}])});window.__lastInjectedId=id;},'image/png');return 'creating';}catch(e){return 'ERROR:'+e.message;}})()" > /dev/null

    sleep 3
    # Return only the final ID
    run_js "(function(){var id=window.__lastInjectedId;delete window.__lastInjectedId;return id?'OK:'+id:'ERROR:no_id';})()"
}

# Create a synthetic video using Canvas frames + MediaRecorder
create_synthetic_video() {
    local name="${1:-test-video.mp4}"
    local duration_sec="${2:-2}"

    # Record a short canvas animation via MediaRecorder
    # Use 10fps and small canvas for speed on simulator
    run_js "(function(){try{window.__lastInjectedId=null;var c=document.createElement('canvas');c.width=320;c.height=240;var x=c.getContext('2d');var stream=c.captureStream(10);var mt='video/mp4';if(!MediaRecorder.isTypeSupported(mt))mt='video/webm';var rec=new MediaRecorder(stream,{mimeType:mt});var chunks=[];rec.ondataavailable=function(e){chunks.push(e.data);};rec.onstop=function(){var blob=new Blob(chunks,{type:mt});var u=URL.createObjectURL(blob);var ms=window.__mediaStore;if(!ms){window.__lastInjectedId='ERR';return;}var id='vid_'+Date.now();ms.setState({mediaItems:ms.getState().mediaItems.concat([{id:id,name:'${name}',type:'video',file:new File([blob],'${name}'),url:u,thumbnailStatus:'ready',duration:${duration_sec},width:320,height:240}])});window.__lastInjectedId=id;};rec.start(100);var f=0;var total=Math.ceil(${duration_sec}*10);function draw(){x.fillStyle='hsl('+(f*12%360)+',70%,50%)';x.fillRect(0,0,320,240);x.fillStyle='#fff';x.font='24px Arial';x.textAlign='center';x.fillText('F'+f,160,120);f++;if(f<total)requestAnimationFrame(draw);else setTimeout(function(){rec.stop()},300);}draw();return 'rec';}catch(e){return 'ERROR:'+e.message;}})()" > /dev/null

    # Poll for the ID with retries (MediaRecorder stop is async)
    local attempts=0
    while [ "$attempts" -lt 8 ]; do
        sleep 2
        local result
        result=$(run_js "(function(){var id=window.__lastInjectedId;if(!id)return 'PENDING';delete window.__lastInjectedId;return 'OK:'+id;})()")
        if echo "$result" | grep -q "^OK:"; then
            echo "$result"
            return 0
        fi
        if echo "$result" | grep -q "^ERROR"; then
            echo "$result"
            return 1
        fi
        attempts=$((attempts + 1))
    done
    echo "ERROR:video_creation_timeout"
}

# Create synthetic audio using Web Audio API
create_synthetic_audio() {
    local name="${1:-test-audio.mp3}"
    local duration_sec="${2:-2}"

    run_js "(function(){try{window.__lastInjectedId=null;var ctx=new OfflineAudioContext(1,48000*${duration_sec},48000);var osc=ctx.createOscillator();osc.frequency.value=440;var gain=ctx.createGain();gain.gain.value=0.3;osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(${duration_sec});ctx.startRendering().then(function(buf){var len=buf.length;var wav=new ArrayBuffer(44+len*4);var v=new DataView(wav);function w(o,s){for(var i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));}w(0,'RIFF');v.setUint32(4,36+len*4,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,3,true);v.setUint16(22,1,true);v.setUint32(24,48000,true);v.setUint32(28,48000*4,true);v.setUint16(32,4,true);v.setUint16(34,32,true);w(36,'data');v.setUint32(40,len*4,true);var d=new Float32Array(wav,44);for(var i=0;i<len;i++)d[i]=buf.getChannelData(0)[i];var blob=new Blob([wav],{type:'audio/wav'});var f=new File([blob],'${name}',{type:'audio/wav'});var u=URL.createObjectURL(blob);var ms=window.__mediaStore;if(!ms)return;var id='aud_'+Date.now();ms.setState({mediaItems:ms.getState().mediaItems.concat([{id:id,name:'${name}',type:'audio',file:f,url:u,thumbnailStatus:'ready',duration:${duration_sec},width:0,height:0}])});window.__lastInjectedId=id;});return 'gen';}catch(e){return 'ERROR:'+e.message;}})()" > /dev/null

    # Poll for the ID
    local attempts=0
    while [ "$attempts" -lt 6 ]; do
        sleep 2
        local result
        result=$(run_js "(function(){var id=window.__lastInjectedId;if(!id)return 'PENDING';delete window.__lastInjectedId;return 'OK:'+id;})()")
        if echo "$result" | grep -q "^OK:"; then
            echo "$result"
            return 0
        fi
        attempts=$((attempts + 1))
    done
    echo "ERROR:audio_creation_timeout"
}

# Add a media element to the timeline
add_media_to_timeline() {
    local media_id="$1"
    local track_type="$2"
    local start_time="${3:-0}"
    local duration="${4:-2}"

    local result
    result=$(run_js "(function(){var tl=window.__timelineStore;if(!tl)return 'ERROR:no_tl';var s=tl.getState();var tid=s.findOrCreateTrack('${track_type}');var eid=s.addElementToTrack(tid,{type:'media',mediaId:'${media_id}',name:'test',duration:${duration},startTime:${start_time},trimStart:0,volume:100});var c=tl.getState().tracks.reduce(function(s,t){return s+t.elements.length},0);return eid?'OK:'+c+'_els':'ERROR:null'})()")
    log "  Timeline: $result"
}

# Add a text element to the timeline
add_text_to_timeline() {
    local content="$1"
    local start_time="${2:-0}"
    local duration="${3:-2}"

    run_js "(function(){var tl=window.__timelineStore;if(!tl)return 'E';var s=tl.getState();var tid=s.findOrCreateTrack('text');s.addElementToTrack(tid,{type:'text',content:'${content}',name:'txt',duration:${duration},startTime:${start_time},trimStart:0,fontSize:48,fontFamily:'Arial',color:'#ffffff',backgroundColor:'transparent',textAlign:'center',fontWeight:'normal',fontStyle:'normal',textDecoration:'none',x:0.5,y:0.5,rotation:0,opacity:1});return 'OK'})()" > /dev/null
}

# Run an export test
run_export_test() {
    local test_name="$1"
    local quality="${2:-480p}"
    local format="${3:-mp4}"
    local timeout="${4:-90}"

    log "Exporting: ${quality} ${format} (timeout: ${timeout}s)..."
    cli_cmd "export?quality=${quality}&format=${format}&filename=test-${quality}-${format}"

    sleep 3
    cli_cmd "export-status"
    local initial
    initial=$(cli_result 2 5)

    if echo "$initial" | grep -qi "no export"; then
        fail "$test_name — no export actions available"
        return 1
    fi

    local export_result
    if export_result=$(wait_export "$timeout"); then
        ok "$test_name — $export_result"
        return 0
    else
        fail "$test_name — $export_result"
        return 1
    fi
}

# Parse media ID from injection result
parse_media_id() {
    local result="$1"
    if echo "$result" | grep -q "^OK:"; then
        echo "${result#OK:}"
        return 0
    else
        echo ""
        return 1
    fi
}

# ── Ensure app is ready ─────────────────────────────────────────────────────

ensure_app_ready() {
    info "Checking simulator and app..."

    if ! xcrun simctl list devices booted 2>&1 | grep -q "Booted"; then
        echo "ERROR: No simulator booted"
        exit 1
    fi

    cli_cmd "state"
    local state
    state=$(cli_result 3 5)

    if [ -z "$state" ] || echo "$state" | grep -q "no store"; then
        info "App not ready, launching..."
        xcrun simctl terminate booted "$BUNDLE_ID" 2>/dev/null || true
        sleep 1
        xcrun simctl launch booted "$BUNDLE_ID" 2>/dev/null || true
        sleep 6
        cli_cmd "navigate?path=/editor/new"
        sleep 4
    fi

    cli_cmd "state"
    state=$(cli_result 2 5)
    if ! echo "$state" | grep -q '"tracks"'; then
        info "Navigating to editor..."
        cli_cmd "navigate?path=/editor/new"
        sleep 4
        cli_cmd "state"
        state=$(cli_result 2 5)
        if ! echo "$state" | grep -q '"tracks"'; then
            fail "Editor not ready after navigation"
            return 1
        fi
    fi

    ok "App ready"
}

# ── Test Cases ───────────────────────────────────────────────────────────────

test_text_export() {
    echo ""
    hr
    echo "📝 TEST: Text-Only Export"
    hr
    reset_project
    add_text_to_timeline "Hello World" 0 2
    run_export_test "Text→480p MP4" "480p" "mp4" 60
}

test_image_export() {
    echo ""
    hr
    echo "🖼️  TEST: Image-Only Export"
    hr
    reset_project

    info "Creating synthetic test image..."
    local inject_result
    inject_result=$(create_synthetic_image "test-image.png" "ff6600")
    local img_id
    img_id=$(parse_media_id "$inject_result")
    if [ -z "$img_id" ]; then
        fail "Image export — injection failed: $inject_result"
        return
    fi
    log "Media ID: $img_id"

    add_media_to_timeline "$img_id" "media" 0 2
    run_export_test "Image→480p MP4" "480p" "mp4" 60
}

test_video_export() {
    echo ""
    hr
    echo "🎬 TEST: Video-Only Export"
    hr
    reset_project

    info "Creating synthetic test video (2s)..."
    local inject_result
    inject_result=$(create_synthetic_video "test-video.mp4" 2)
    local vid_id
    vid_id=$(parse_media_id "$inject_result")
    if [ -z "$vid_id" ]; then
        fail "Video export — injection failed: $inject_result"
        return
    fi
    log "Media ID: $vid_id"

    add_media_to_timeline "$vid_id" "media" 0 2
    run_export_test "Video→480p MP4" "480p" "mp4" 90
}

test_mixed_export() {
    echo ""
    hr
    echo "🎭 TEST: Mixed Media (Image + Text) Export"
    hr
    reset_project

    info "Creating synthetic image..."
    local inject_result
    inject_result=$(create_synthetic_image "mix-image.png" "3366ff")
    local img_id
    img_id=$(parse_media_id "$inject_result")
    if [ -z "$img_id" ]; then
        fail "Mixed export — image injection failed: $inject_result"
        return
    fi
    add_media_to_timeline "$img_id" "media" 0 3
    add_text_to_timeline "Overlay" 0.5 2

    run_export_test "Mixed→480p MP4" "480p" "mp4" 60
}

test_video_with_audio() {
    echo ""
    hr
    echo "🔊 TEST: Video + Audio Export"
    hr
    reset_project

    info "Creating synthetic video..."
    local vid_result
    vid_result=$(create_synthetic_video "va-video.mp4" 2)
    local vid_id
    vid_id=$(parse_media_id "$vid_result")
    if [ -z "$vid_id" ]; then
        fail "Video+Audio — video creation failed: $vid_result"
        return
    fi
    add_media_to_timeline "$vid_id" "media" 0 2

    info "Creating synthetic audio..."
    local aud_result
    aud_result=$(create_synthetic_audio "va-audio.wav" 2)
    local aud_id
    aud_id=$(parse_media_id "$aud_result")
    if [ -z "$aud_id" ]; then
        fail "Video+Audio — audio creation failed: $aud_result"
        return
    fi
    add_media_to_timeline "$aud_id" "audio" 0 2

    run_export_test "Video+Audio→480p MP4" "480p" "mp4" 90
}

test_format_matrix() {
    echo ""
    hr
    echo "🔄 TEST: Format & Quality Matrix"
    hr

    local formats=("mp4" "webm")
    local qualities=("480p" "720p")

    for fmt in "${formats[@]}"; do
        for qual in "${qualities[@]}"; do
            reset_project
            add_text_to_timeline "Test ${qual} ${fmt}" 0 1
            run_export_test "Text→${qual} ${fmt}" "$qual" "$fmt" 60
        done
    done
}

test_empty_timeline() {
    echo ""
    hr
    echo "🚫 TEST: Empty Timeline (should fail gracefully)"
    hr
    reset_project

    cli_cmd "export?quality=480p&format=mp4&filename=test-empty"
    sleep 4
    cli_cmd "export-status"
    local result
    result=$(cli_result 2 5)

    if echo "$result" | grep -qi "failed\|error\|no canvas\|duration"; then
        ok "Empty timeline — rejected gracefully"
    elif echo "$result" | grep -qi '"isExporting":true'; then
        log "Export started on empty timeline, waiting..."
        local wr
        if wr=$(wait_export 30); then
            fail "Empty timeline — should not succeed with no content"
        else
            ok "Empty timeline — failed gracefully: $wr"
        fi
    elif echo "$result" | grep -qi '"progress":0.*"status":""'; then
        ok "Empty timeline — export not triggered (no content)"
    else
        fail "Empty timeline — unexpected response: $result"
    fi
}

test_1080p() {
    echo ""
    hr
    echo "📐 TEST: 1080p Export"
    hr
    reset_project
    add_text_to_timeline "1080p Test" 0 1
    run_export_test "Text→1080p MP4" "1080p" "mp4" 90
}

# ── Main ─────────────────────────────────────────────────────────────────────

main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║       QCut iPad Simulator Export Test Suite              ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""

    ensure_app_ready

    local test_filter="${1:-all}"

    case "$test_filter" in
        text)     test_text_export ;;
        image)    test_image_export ;;
        video)    test_video_export ;;
        mixed)    test_mixed_export ;;
        audio)    test_video_with_audio ;;
        formats)  test_format_matrix ;;
        empty)    test_empty_timeline ;;
        1080p)    test_1080p ;;
        all)
            test_text_export
            test_image_export
            test_video_export
            test_mixed_export
            test_video_with_audio
            test_format_matrix
            test_empty_timeline
            test_1080p
            ;;
        *)
            echo "Unknown test: $test_filter"
            echo "Available: text, image, video, mixed, audio, formats, empty, 1080p, all"
            exit 1
            ;;
    esac

    echo ""
    hr
    echo "📊 RESULTS: $PASS passed, $FAIL failed"
    if [ $FAIL -gt 0 ]; then
        printf "Failures:\n%s" "$ERRORS"
    fi
    hr

    [ $FAIL -eq 0 ]
}

main "$@"
