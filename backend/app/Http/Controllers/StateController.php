<?php

namespace App\Http\Controllers;

use App\Services\AuthenticationService;
use App\Services\StateService;
use Illuminate\Http\JsonResponse;

class StateController extends Controller
{
    public function __construct(
        private readonly AuthenticationService $authentication,
        private readonly StateService $state,
    ) {
    }

    public function show(): JsonResponse
    {
        $user = $this->authentication->currentUser();
        if (! $user) {
            return response()->json(['error' => 'Please sign in again.'], 401);
        }

        return response()->json([
            'state' => $this->state->read($user),
            'revision' => $this->state->revision(),
            'result' => null,
        ]);
    }
}
